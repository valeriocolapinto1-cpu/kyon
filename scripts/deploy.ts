/**
 * Non-interactive deploy, used by .github/workflows/deploy.yml.
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (never `wrangler login`).
 *
 * 1. Makes sure D1, KV and R2 exist (creates them on first run) and reads their IDs.
 * 2. Writes wrangler.deploy.json next to each wrangler.jsonc with the real IDs.
 * 3. Applies D1 migrations, then deploys realtime (owns the Durable Objects), cron and web.
 *
 * Expects `pnpm build` to have produced the OpenNext bundle.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './lib/jsonc';
import { repoRoot, run } from './lib/run';

const D1_NAME = 'kyon-db';
const KV_TITLE = 'kyon-kv';
const R2_BUCKET = 'kyon-files';
const DEPLOY_CONFIG = 'wrangler.deploy.json';

for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!process.env[name]) {
    console.error(`${name} is not set. See docs/SETUP.md.`);
    process.exit(1);
  }
}

const webDir = path.join(repoRoot, 'apps', 'web');
const wrangler = (args: string[], capture = true) =>
  run('pnpm', ['exec', 'wrangler', ...args], { cwd: webDir, capture });

async function ensureD1(): Promise<string> {
  const find = async () => {
    const list = JSON.parse(await wrangler(['d1', 'list', '--json'])) as {
      name: string;
      uuid: string;
    }[];
    return list.find((db) => db.name === D1_NAME)?.uuid;
  };
  let id = await find();
  if (!id) {
    console.log(`Creating D1 database ${D1_NAME}...`);
    await wrangler(['d1', 'create', D1_NAME], false);
    id = await find();
  }
  if (!id) throw new Error(`D1 database ${D1_NAME} not found after creation`);
  return id;
}

async function ensureKv(): Promise<string> {
  const find = async () => {
    const list = JSON.parse(await wrangler(['kv', 'namespace', 'list'])) as {
      id: string;
      title: string;
    }[];
    return list.find((ns) => ns.title === KV_TITLE)?.id;
  };
  let id = await find();
  if (!id) {
    console.log(`Creating KV namespace ${KV_TITLE}...`);
    await wrangler(['kv', 'namespace', 'create', KV_TITLE], false);
    id = await find();
  }
  if (!id) throw new Error(`KV namespace ${KV_TITLE} not found after creation`);
  return id;
}

async function ensureR2(): Promise<void> {
  const list = await wrangler(['r2', 'bucket', 'list']);
  if (!new RegExp(`^name:\\s+${R2_BUCKET}$`, 'm').test(list)) {
    console.log(`Creating R2 bucket ${R2_BUCKET}...`);
    await wrangler(['r2', 'bucket', 'create', R2_BUCKET], false);
  }
}

interface WranglerConfig {
  d1_databases?: { database_name: string; database_id: string }[];
  kv_namespaces?: { binding: string; id: string }[];
}

function writeDeployConfig(dir: string, ids: { d1: string; kv: string }) {
  const config = parseJsonc<WranglerConfig>(readFileSync(path.join(dir, 'wrangler.jsonc'), 'utf8'));
  for (const db of config.d1_databases ?? []) {
    if (db.database_name === D1_NAME) db.database_id = ids.d1;
  }
  for (const ns of config.kv_namespaces ?? []) ns.id = ids.kv;
  writeFileSync(path.join(dir, DEPLOY_CONFIG), JSON.stringify(config, null, 2));
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
