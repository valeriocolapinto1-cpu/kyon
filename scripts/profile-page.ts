/**
 * Dev tool: CPU profile of a logged-in page with Lighthouse-like 4× CPU throttling, on the
 * production bundle. `pnpm build`, then: pnpm profile / /settings
 * Prints the long tasks and the functions with the most self time.
 */
import { chromium } from '@playwright/test';
import { deriveClientKey } from '../packages/core/src/auth/password';
import { E2E_BOOTSTRAP_CODE, e2eServerArgs, prepareE2e, webDir } from './lib/e2e';
import { spawnLong } from './lib/run';

const PORT = 8791;
const base = `http://localhost:${PORT}`;
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];

prepareE2e();
const server = spawnLong('server', 'pnpm', e2eServerArgs(PORT), webDir);
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 120) throw new Error('Server did not start');
    await new Promise((r) => setTimeout(r, 1000));
  }
  const email = `profile-${Date.now()}@kyon.test`;
  const joined = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: E2E_BOOTSTRAP_CODE,
      name: 'Profilo',
      email,
      key: await deriveClientKey(email, 'password profilo'),
    }),
  });
  const cookie = joined.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  await fetch(`${base}/api/me/tour`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ done: true }),
  });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
  });
  await context.setExtraHTTPHeaders({ cookie });
  for (const path of paths) {
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning')
        console.log(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`);
    });
    page.on('pageerror', (error) => console.log(`[pageerror] ${error.message.slice(0, 300)}`));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await page.addInitScript(() => {
      (window as unknown as { __long: number[][] }).__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          (window as unknown as { __long: number[][] }).__long.push([
            Math.round(e.startTime),
            Math.round(e.duration),
          ]);
      }).observe({ type: 'longtask', buffered: true });
    });
    await cdp.send('Profiler.start');
    await page.goto(base + path, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    const { profile } = await cdp.send('Profiler.stop');
    const long = await page.evaluate(() => (window as unknown as { __long: number[][] }).__long);
    const tbt = long.reduce((s, [, d]) => s + Math.max(0, (d ?? 0) - 50), 0);
    console.log(`\n=== ${path}: long tasks ${JSON.stringify(long)} → blocking ${tbt} ms`);
    const total = new Map<string, number>();
    const dt = profile.timeDeltas ?? [];
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    (profile.samples ?? []).forEach((id, i) => {
      const node = byId.get(id);
      if (!node) return;
      const f = node.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.replace(base, '')}:${f.lineNumber}:${f.columnNumber}`;
      total.set(key, (total.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
    });
    for (const [key, ms] of [...total].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(`${ms.toFixed(0).padStart(6)} ms  ${key}`);
    // Inside the longest task: which stacks (outermost named app frames) cost the most.
    const [start, duration] = [...long].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0] ?? [0, 0];
    const parent = new Map<number, number>();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    // Profile times are monotonic µs; NavigationStart (s) is on the same clock.
    await cdp.send('Performance.enable');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const navStart = (metrics.find((m) => m.name === 'NavigationStart')?.value ?? 0) * 1000;
    let t = profile.startTime / 1000 - navStart;
    const inside = new Map<string, number>();
    // The framework chunk: where most samples land overall.
    const reactChunk =
      [...total]
        .filter(([k]) => k.includes('/chunks/') && !k.includes('turbopack-'))
        .sort((a, b) => b[1] - a[1])[0]?.[0]
        .split(' ')[1]
        ?.split('/')
        .pop()
        ?.split(':')[0] ?? '';
    (profile.samples ?? []).forEach((id, i) => {
      t += (dt[i] ?? 0) / 1000;
      if (t < (start ?? 0) || t > (start ?? 0) + (duration ?? 0)) return;
      const chain: string[] = [];
      for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
        const f = byId.get(cur)?.callFrame;
        if (f?.functionName && f.url.includes('/chunks/') && !f.url.includes('turbopack-'))
          chain.push(`${f.functionName}@${f.url.split('/').pop()}:${f.columnNumber}`);
      }
      // Innermost frames outside React itself (react-dom lives in the biggest framework chunk).
      const app = chain.filter((c) => !c.includes(reactChunk));
      const key = app.slice(0, 3).join(' < ') || `(react) ${chain[0] ?? '(native)'}`;
      inside.set(key, (inside.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
    });
    console.log(`--- inside the longest task (${duration} ms at ${start})`);
    for (const [key, ms] of [...inside].sort((a, b) => b[1] - a[1]).slice(0, 12))
      console.log(`${ms.toFixed(0).padStart(6)} ms  ${key}`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
