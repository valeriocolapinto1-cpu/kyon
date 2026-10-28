/**
 * Non-interactive deploy, used by .github/workflows/deploy.yml.
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (never `wrangler login`).
 *
 * 1. Makes sure D1, KV and R2 exist (creates them on first run) and reads their IDs.
 * 2. Writes wrangler.deploy.json next to each wrangler.jsonc with the real IDs.
 * 3. Applies D1 migrations, then deploys realtime (owns the Durable Objects), cron and web.
 * 4. Makes sure the web Worker has its secrets: BETTER_AUTH_SECRET and TOKEN_ENCRYPTION_KEY are
 *    generated once and never leave Cloudflare; ADMIN_BOOTSTRAP_CODE and the GitHub App secrets are
 *    copied from GitHub Actions secrets when provided (names can't start with GITHUB_ there, hence
 *    KYON_GH_*).
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
  resolveSiteUrl,
  webDir,
  writeDeployConfig,
} from './lib/cloudflare';
import { generateVapidKeys } from '@kyon/core';
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
const siteUrl = await resolveSiteUrl();
for (const dir of [webDir, realtimeDir, cronDir]) writeDeployConfig(dir, ids, siteUrl);

console.log('Applying D1 migrations...');
await run(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'migrations', 'apply', D1_NAME, '--remote', '--config', DEPLOY_CONFIG],
  { cwd: webDir },
);

// Order matters on the very first deploy: the web Worker binds to the realtime Durable
// Object classes by script name, and the cron Worker has a service binding to the web one.
for (const dir of [realtimeDir, webDir, cronDir]) {
  console.log(`Deploying ${path.relative(repoRoot, dir)}...`);
  await run('pnpm', ['exec', 'wrangler', 'deploy', '--config', DEPLOY_CONFIG], { cwd: dir });
}

async function existingSecrets(dir = webDir): Promise<Set<string>> {
  const raw = await run(
    'pnpm',
    ['exec', 'wrangler', 'secret', 'list', '--config', DEPLOY_CONFIG, '--format', 'json'],
    {
      cwd: dir,
      capture: true,
    },
  );
  const list = JSON.parse(raw.slice(raw.indexOf('['))) as { name: string }[];
  return new Set(list.map((secret) => secret.name));
}

async function putSecret(name: string, value: string, dir = webDir) {
  await run('pnpm', ['exec', 'wrangler', 'secret', 'put', name, '--config', DEPLOY_CONFIG], {
    cwd: dir,
    stdin: value,
  });
}

const random = (encoding: 'base64' | 'base64url') =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(encoding);
const secrets = await existingSecrets();

if (!secrets.has('BETTER_AUTH_SECRET')) {
  console.log('Generating BETTER_AUTH_SECRET (stored only in Cloudflare)...');
  await putSecret('BETTER_AUTH_SECRET', random('base64url'));
}
if (!secrets.has('TOKEN_ENCRYPTION_KEY')) {
  // Never rotate this one blindly: it decrypts the stored GitHub tokens.
  console.log('Generating TOKEN_ENCRYPTION_KEY (stored only in Cloudflare)...');
  await putSecret('TOKEN_ENCRYPTION_KEY', random('base64'));
}

// INTERNAL_SECRET authenticates cron → web and web → realtime, and signs realtime tickets.
// Generated once and put on the three Workers together.
const cronSecrets = await existingSecrets(cronDir);
const realtimeSecrets = await existingSecrets(realtimeDir);
if (
  !secrets.has('INTERNAL_SECRET') ||
  !cronSecrets.has('INTERNAL_SECRET') ||
  !realtimeSecrets.has('INTERNAL_SECRET')
) {
  console.log('Generating INTERNAL_SECRET (web + cron + realtime)...');
  const value = random('base64url');
  await putSecret('INTERNAL_SECRET', value);
  await putSecret('INTERNAL_SECRET', value, cronDir);
  await putSecret('INTERNAL_SECRET', value, realtimeDir);
}

// Web Push (VAPID): generated once. Rotating it would silently break every push subscription.
if (!secrets.has('VAPID_PRIVATE_KEY') || !secrets.has('VAPID_PUBLIC_KEY')) {
  console.log('Generating VAPID keys for Web Push...');
  const keys = await generateVapidKeys();
  await putSecret('VAPID_PUBLIC_KEY', keys.publicKey);
  await putSecret('VAPID_PRIVATE_KEY', keys.privateKey);
}

const bootstrap = process.env.ADMIN_BOOTSTRAP_CODE;
if (bootstrap && !secrets.has('ADMIN_BOOTSTRAP_CODE')) {
  if (bootstrap.length < 12) throw new Error('ADMIN_BOOTSTRAP_CODE must be at least 12 characters');
  console.log('Setting ADMIN_BOOTSTRAP_CODE...');
  await putSecret('ADMIN_BOOTSTRAP_CODE', bootstrap);
}

// GitHub App: Actions forbids secret names starting with GITHUB_, hence KYON_GH_*.
// Re-put on every deploy so rotating a value in GitHub Actions is enough.
const github: Record<string, string | undefined> = {
  GITHUB_APP_CLIENT_ID: process.env.KYON_GH_CLIENT_ID,
  GITHUB_APP_CLIENT_SECRET: process.env.KYON_GH_CLIENT_SECRET,
  GITHUB_WEBHOOK_SECRET: process.env.KYON_GH_WEBHOOK_SECRET,
};
for (const [name, value] of Object.entries(github)) {
  if (value) await putSecret(name, value);
}
