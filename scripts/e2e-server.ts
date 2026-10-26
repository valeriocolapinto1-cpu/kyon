/**
 * Starts the production bundle on local workerd with fresh e2e state (used by Playwright's webServer).
 * Requires `pnpm build`.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createFakeGitHub, defaultFakeState } from '../apps/web/src/test/fakeGithub';
import {
  E2E_CONFIG,
  E2E_PORT,
  FAKE_GITHUB_PORT,
  e2eServerArgs,
  e2eStateDir,
  prepareE2e,
  webDir,
} from './lib/e2e';
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
// Fake GitHub (OAuth, installations, repos…) so no test ever talks to the real one.
const fakeState = defaultFakeState(`http://localhost:${process.env.KYON_PORT ?? E2E_PORT}`);
fakeState.webOrigin = `http://localhost:${FAKE_GITHUB_PORT}`;
const fake = createFakeGitHub(fakeState);
const fakeServer = serve({ fetch: fake.app.fetch, port: FAKE_GITHUB_PORT });
const child = spawnLong(
  'e2e',
  'pnpm',
  e2eServerArgs(Number(process.env.KYON_PORT ?? E2E_PORT)),
  webDir,
);
child.on('exit', (code) => {
  fakeServer.close();
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill());
