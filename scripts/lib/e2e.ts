import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc';
import { repoRoot } from './run';

export const E2E_PORT = 8787;
export const E2E_BOOTSTRAP_CODE = 'e2e-bootstrap-code-kyon';
export const e2eStateDir = path.join(repoRoot, '.wrangler', 'e2e-state');
export const webDir = path.join(repoRoot, 'apps', 'web');
export const E2E_CONFIG = 'wrangler.e2e.json';

interface Config {
  ratelimits?: { simple: { limit: number; period: number } }[];
  vars?: Record<string, string>;
}

/**
 * Fresh, isolated state for e2e/Lighthouse runs and a wrangler config with relaxed rate limits
 * (every test comes from the same IP). Production code paths are unchanged.
 */
export function prepareE2e(): void {
  rmSync(e2eStateDir, { recursive: true, force: true });
  mkdirSync(e2eStateDir, { recursive: true });
  const config = parseJsonc<Config>(readFileSync(path.join(webDir, 'wrangler.jsonc'), 'utf8'));
  for (const limiter of config.ratelimits ?? []) limiter.simple.limit = 100_000;
  config.vars = {
    ...config.vars,
    KYON_ENV: 'development',
    BETTER_AUTH_SECRET: 'e2e-only-secret-not-for-production-0123456789',
    ADMIN_BOOTSTRAP_CODE: E2E_BOOTSTRAP_CODE,
  };
  writeFileSync(path.join(webDir, E2E_CONFIG), JSON.stringify(config, null, 2));
}

export function e2eServerArgs(port = E2E_PORT): string[] {
  return [
    'exec',
    'wrangler',
    'dev',
    '--config',
    E2E_CONFIG,
    '--port',
    String(port),
    '--persist-to',
    e2eStateDir,
    '--log-level',
    'warn',
  ];
}
