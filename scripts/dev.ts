/**
 * Local development: realtime + cron Workers under wrangler and Next.js in dev mode.
 * All of them persist to the same local state, so no Cloudflare login or real resource is needed.
 */
import path from 'node:path';
import { localStateDir, repoRoot, run, spawnLong } from './lib/run';

const web = path.join(repoRoot, 'apps', 'web');

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
    '--persist-to',
    localStateDir,
  ],
  { cwd: web },
);

const children = [
  spawnLong(
    'realtime',
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--port',
      '8788',
      '--inspector-port',
      '9230',
      '--persist-to',
      localStateDir,
    ],
    path.join(repoRoot, 'workers', 'realtime'),
  ),
  spawnLong(
    'cron',
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--port',
      '8789',
      '--inspector-port',
      '9231',
      '--test-scheduled',
      '--persist-to',
      localStateDir,
    ],
    path.join(repoRoot, 'workers', 'cron'),
  ),
  spawnLong('web', 'pnpm', ['exec', 'next', 'dev'], web),
];

let stopping = false;
function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 1));
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
