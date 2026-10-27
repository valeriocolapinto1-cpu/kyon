import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc';
import { repoRoot } from './run';

export const E2E_PORT = 8787;
export const E2E_BOOTSTRAP_CODE = 'e2e-bootstrap-code-kyon';
export const e2eStateDir = path.join(repoRoot, '.wrangler', 'e2e-state');
export const webDir = path.join(repoRoot, 'apps', 'web');
/**
 * Lives outside apps/web on purpose: wrangler loads `.dev.vars` from the config's folder, and a
 * developer's local secrets must not leak into e2e runs.
 */
export const E2E_CONFIG = path.join(repoRoot, '.wrangler', 'e2e', 'wrangler.json');
export const FAKE_GITHUB_PORT = 8799;
export const E2E_INTERNAL_SECRET = 'e2e-internal-secret-not-for-production';
const realtimeDir = path.join(repoRoot, 'workers', 'realtime');
/** The realtime Worker runs in the same `wrangler dev` session, so DO bindings resolve. */
export const E2E_REALTIME_CONFIG = path.join(repoRoot, '.wrangler', 'e2e', 'realtime.json');

interface Config {
  main?: string;
  assets?: { directory: string };
  d1_databases?: { migrations_dir?: string }[];
  compatibility_flags?: string[];
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
  // Absolute paths: the config file lives in another folder.
  if (config.main) config.main = path.join(webDir, config.main);
  if (config.assets) config.assets.directory = path.join(webDir, config.assets.directory);
  for (const db of config.d1_databases ?? [])
    if (db.migrations_dir) db.migrations_dir = path.join(webDir, db.migrations_dir);
  for (const limiter of config.ratelimits ?? []) limiter.simple.limit = 100_000;
  // The fake GitHub server runs on localhost, which this production flag would block.
  config.compatibility_flags = (config.compatibility_flags ?? []).filter(
    (f) => f !== 'global_fetch_strictly_public',
  );
  const fake = `http://localhost:${FAKE_GITHUB_PORT}`;
  config.vars = {
    ...config.vars,
    KYON_ENV: 'development',
    BETTER_AUTH_SECRET: 'e2e-only-secret-not-for-production-0123456789',
    ADMIN_BOOTSTRAP_CODE: E2E_BOOTSTRAP_CODE,
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    GITHUB_APP_CLIENT_ID: 'e2e-client-id',
    GITHUB_APP_CLIENT_SECRET: 'e2e-client-secret',
    GITHUB_APP_SLUG: 'kyon-e2e',
    GITHUB_WEBHOOK_SECRET: 'e2e-webhook-secret',
    GITHUB_API_URL: fake,
    GITHUB_WEB_URL: fake,
    INTERNAL_SECRET: E2E_INTERNAL_SECRET,
    // Test-only Web Push keys (the browser can't reach a real push service in e2e).
    VAPID_PUBLIC_KEY:
      'BMBH1u6S9GgNgCT-VMKQbAbG8Ft8sOTjk8L6cO_tAtNHaySUVdBrvj6zm8cHGVO3E0IMzbzj7RL0iBFFSp02-x4',
    VAPID_PRIVATE_KEY: 'Gft1JSvz27DuQERjD9A-k3fvZm8mGJQDAIIivl4al4A',
  };
  mkdirSync(path.dirname(E2E_CONFIG), { recursive: true });
  writeFileSync(E2E_CONFIG, JSON.stringify(config, null, 2));
  const realtime = parseJsonc<Config>(
    readFileSync(path.join(realtimeDir, 'wrangler.jsonc'), 'utf8'),
  );
  if (realtime.main) realtime.main = path.join(realtimeDir, realtime.main);
  realtime.vars = { ...realtime.vars, INTERNAL_SECRET: E2E_INTERNAL_SECRET };
  writeFileSync(E2E_REALTIME_CONFIG, JSON.stringify(realtime, null, 2));
}

export function e2eServerArgs(port = E2E_PORT): string[] {
  return [
    'exec',
    'wrangler',
    'dev',
    '--config',
    E2E_CONFIG,
    '--config',
    E2E_REALTIME_CONFIG,
    '--port',
    String(port),
    '--persist-to',
    e2eStateDir,
    '--log-level',
    'warn',
  ];
}
