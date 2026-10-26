/**
 * Runs Lighthouse CI (accessibility ≥ 95, mobile performance ≥ 80) on the production bundle.
 * Uses Playwright's Chromium when CHROME_PATH is not set. Run `pnpm build` first.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { repoRoot, run } from './lib/run';

if (!existsSync(path.join(repoRoot, 'apps', 'web', '.open-next', 'worker.js'))) {
  console.error('Missing .open-next/worker.js: run `pnpm build` first.');
  process.exit(1);
}

const chromePath = process.env.CHROME_PATH ?? chromium.executablePath();
await run('pnpm', ['--filter', '@kyon/web', 'run', 'db:migrate:local'], { capture: true });
await run('pnpm', ['exec', 'lhci', 'autorun', '--config=lighthouserc.cjs'], {
  env: { CHROME_PATH: chromePath },
});
