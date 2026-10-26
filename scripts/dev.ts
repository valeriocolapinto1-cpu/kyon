/**
 * Local development: realtime + cron Workers under wrangler and Next.js in dev mode.
 * All of them persist to the same local state, so no Cloudflare login or real resource is needed.
 */
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createFakeGitHub, defaultFakeState } from '../apps/web/src/test/fakeGithub';
import { ensureDevVars } from './lib/devvars';
import { localStateDir, repoRoot, run, spawnLong } from './lib/run';

const web = path.join(repoRoot, 'apps', 'web');
const vars = ensureDevVars();
const fakeGitHub = vars.GITHUB_API_URL?.startsWith('http://localhost:8799')
  ? serve({
      fetch: createFakeGitHub({
        ...defaultFakeState('http://localhost:3000'),
        webOrigin: 'http://localhost:8799',
      }).app.fetch,
      port: 8799,
    })
  : null;

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

if (fakeGitHub) {
  console.log(
    'GitHub finto su http://localhost:8799 (configura una GitHub App vera in apps/web/.dev.vars per usare GitHub).',
  );
}
console.log(
  `\nKyon: http://localhost:3000\nPrimo account (solo se il database locale è vuoto): http://localhost:3000/join?code=${vars.ADMIN_BOOTSTRAP_CODE}\n`,
);

let stopping = false;
function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  fakeGitHub?.close();
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 1));
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
