/**
 * Non-interactive deploy, used by .github/workflows/deploy.yml.
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (never `wrangler login`).
 *
 * 1. Makes sure D1, KV and R2 exist (creates them on first run) and reads their IDs.
 * 2. Writes wrangler.deploy.json next to each wrangler.jsonc with the real IDs.
 * 3. Applies D1 migrations, then deploys realtime (owns the Durable Objects), cron and web.
 * 4. Makes sure the web Worker has its secrets: BETTER_AUTH_SECRET is generated once and never
 *    leaves Cloudflare; ADMIN_BOOTSTRAP_CODE is copied from the GitHub secret when provided.
 *
 * Expects `pnpm build` to have produced the OpenNext bundle.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  D1_NAME,
  DEPLOY_CONFIG,
  ensureD1,
  ensureKv,
  ensureR2,
  webDir,
  writeDeployConfig,
} from './lib/cloudflare';
import { repoRoot, run } from './lib/run';

for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!process.env[name]) {
    console.error(`${name} is not set. See docs/SETUP.md.`);
    process.exit(1);
  }
}

if (!existsSync(path.join(webDir, '.open-next', 'worker.js'))) {
  console.error('Missing .open-next/worker.js: run `pnpm build` first.');
  process.exit(1);
}

const ids = { d1: await ensureD1(), kv: await ensureKv() };
await ensureR2();

const realtimeDir = path.join(repoRoot, 'workers', 'realtime');
const cronDir = path.join(repoRoot, 'workers', 'cron');
for (const dir of [webDir, realtimeDir, cronDir]) writeDeployConfig(dir, ids);

console.log('Applying D1 migrations...');
await run(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'migrations', 'apply', D1_NAME, '--remote', '--config', DEPLOY_CONFIG],
  { cwd: webDir },
);

// Realtime first: the web Worker binds to its Durable Object classes by script name.
for (const dir of [realtimeDir, cronDir, webDir]) {
  console.log(`Deploying ${path.relative(repoRoot, dir)}...`);
  await run('pnpm', ['exec', 'wrangler', 'deploy', '--config', DEPLOY_CONFIG], { cwd: dir });
}

async function existingSecrets(): Promise<Set<string>> {
  const raw = await run(
    'pnpm',
    ['exec', 'wrangler', 'secret', 'list', '--config', DEPLOY_CONFIG, '--format', 'json'],
    {
      cwd: webDir,
      capture: true,
    },
  );
  const list = JSON.parse(raw.slice(raw.indexOf('['))) as { name: string }[];
  return new Set(list.map((secret) => secret.name));
}

async function putSecret(name: string, value: string) {
  await run('pnpm', ['exec', 'wrangler', 'secret', 'put', name, '--config', DEPLOY_CONFIG], {
    cwd: webDir,
    stdin: value,
  });
}

const secrets = await existingSecrets();
if (!secrets.has('BETTER_AUTH_SECRET')) {
  console.log('Generating BETTER_AUTH_SECRET (stored only in Cloudflare)...');
  await putSecret(
    'BETTER_AUTH_SECRET',
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
  );
}
const bootstrap = process.env.ADMIN_BOOTSTRAP_CODE;
if (bootstrap && !secrets.has('ADMIN_BOOTSTRAP_CODE')) {
  if (bootstrap.length < 12) throw new Error('ADMIN_BOOTSTRAP_CODE must be at least 12 characters');
  console.log('Setting ADMIN_BOOTSTRAP_CODE...');
  await putSecret('ADMIN_BOOTSTRAP_CODE', bootstrap);
}
