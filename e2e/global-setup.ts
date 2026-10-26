import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (!existsSync(path.join(root, 'apps', 'web', '.open-next', 'worker.js'))) {
    throw new Error('Missing OpenNext bundle: run `pnpm build` before `pnpm e2e`.');
  }
  execFileSync('pnpm', ['--filter', '@kyon/web', 'run', 'db:migrate:local'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
}
