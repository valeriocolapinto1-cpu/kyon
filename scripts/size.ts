/**
 * Measures the gzip size of every Worker bundle as Cloudflare would receive it
 * (via `wrangler deploy --dry-run`) and fails above the alarm threshold.
 * Run `pnpm build` first so the OpenNext bundle exists.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { WORKER_GZIP_ALARM_BYTES, WORKER_GZIP_LIMIT_BYTES } from '../packages/core/src/limits';
import { repoRoot, run } from './lib/run';

const workers = [
  { name: 'kyon-web', dir: path.join(repoRoot, 'apps', 'web') },
  { name: 'kyon-realtime', dir: path.join(repoRoot, 'workers', 'realtime') },
  { name: 'kyon-cron', dir: path.join(repoRoot, 'workers', 'cron') },
];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

if (!existsSync(path.join(repoRoot, 'apps', 'web', '.open-next', 'worker.js'))) {
  console.error('Missing .open-next/worker.js: run `pnpm build` first.');
  process.exit(1);
}

const results: { name: string; rawBytes: number; gzipBytes: number }[] = [];
for (const worker of workers) {
  const outdir = path.join(worker.dir, '.size');
  rmSync(outdir, { recursive: true, force: true });
  await run('pnpm', ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', outdir], {
    cwd: worker.dir,
    capture: true,
  });
  // Source maps and the generated README are not uploaded as executable code.
  const files = listFiles(outdir).filter(
    (file) => !file.endsWith('.map') && !file.endsWith('README.md'),
  );
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const content = readFileSync(file);
    rawBytes += content.byteLength;
    gzipBytes += gzipSync(content).byteLength;
  }
  results.push({ name: worker.name, rawBytes, gzipBytes });
}

console.log(
  '\nWorker bundle sizes (alarm %s, Free limit %s gzip)',
  kib(WORKER_GZIP_ALARM_BYTES),
  kib(WORKER_GZIP_LIMIT_BYTES),
);
for (const r of results) {
  const flag = r.gzipBytes > WORKER_GZIP_ALARM_BYTES ? '  <-- OVER ALARM' : '';
  console.log(
    `  ${r.name.padEnd(14)} raw ${kib(r.rawBytes).padStart(11)}   gzip ${kib(r.gzipBytes).padStart(11)}${flag}`,
  );
}

mkdirSync(path.join(repoRoot, '.size'), { recursive: true });
writeFileSync(
  path.join(repoRoot, '.size', 'report.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2),
);

if (results.some((r) => r.gzipBytes > WORKER_GZIP_ALARM_BYTES)) {
  console.error('\nAt least one Worker is above the 2.4 MB gzip alarm threshold.');
  process.exit(1);
}
