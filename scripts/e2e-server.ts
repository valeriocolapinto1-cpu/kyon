/**
 * Starts the production bundle on local workerd with fresh e2e state (used by Playwright's webServer).
 * Requires `pnpm build`.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { E2E_CONFIG, e2eServerArgs, e2eStateDir, prepareE2e, webDir } from './lib/e2e';
import { run, spawnLong } from './lib/run';

if (!existsSync(path.join(webDir, '.open-next', 'worker.js'))) {
  console.error('Missing OpenNext bundle: run `pnpm build` first.');
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
  {
    cwd: webDir,
    capture: true,
  },
);
const child = spawnLong('e2e', 'pnpm', e2eServerArgs(), webDir);
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill());
