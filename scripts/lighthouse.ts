/**
 * Lighthouse CI (accessibility ≥ 95, mobile performance ≥ 80) on the production bundle,
 * logged in as a freshly bootstrapped admin so the real app pages are measured.
 * Uses Playwright's Chromium when CHROME_PATH is not set. Run `pnpm build` first.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { deriveClientKey } from '../packages/core/src/auth/password';
import {
  E2E_BOOTSTRAP_CODE,
  E2E_CONFIG,
  e2eServerArgs,
  e2eStateDir,
  prepareE2e,
  webDir,
} from './lib/e2e';
import { run, spawnLong } from './lib/run';

const PORT = 8790;
const base = `http://localhost:${PORT}`;

if (!existsSync(path.join(webDir, '.open-next', 'worker.js'))) {
  console.error('Missing .open-next/worker.js: run `pnpm build` first.');
  process.exit(1);
}

prepareE2e();
await run(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'kyon-db',
    '--local',
    '--config',
    E2E_CONFIG,
    '--persist-to',
    e2eStateDir,
  ],
  { cwd: webDir, capture: true },
);
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
  const email = 'lighthouse@kyon.test';
  const joined = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: E2E_BOOTSTRAP_CODE,
      name: 'Lighthouse',
      email,
      key: await deriveClientKey(email, 'password lighthouse'),
    }),
  });
  if (!joined.ok) throw new Error(`Bootstrap failed: ${joined.status} ${await joined.text()}`);
  const cookie = joined.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  await run('pnpm', ['exec', 'lhci', 'autorun', '--config=lighthouserc.cjs'], {
    env: {
      CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
      LHCI_BASE_URL: base,
      LHCI_COOKIE: cookie,
    },
  });
} finally {
  server.kill();
}
