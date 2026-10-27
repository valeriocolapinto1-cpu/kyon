/** Cloudflare resources shared by deploy and admin scripts (non-interactive, API token only). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc';
import { repoRoot, run } from './run';

export const D1_NAME = 'kyon-db';
const KV_TITLE = 'kyon-kv';
const R2_BUCKET = 'kyon-files';
export const DEPLOY_CONFIG = 'wrangler.deploy.json';
export const webDir = path.join(repoRoot, 'apps', 'web');
const wrangler = (args: string[], capture = true) =>
  run('pnpm', ['exec', 'wrangler', ...args], { cwd: webDir, capture });

export async function ensureD1(): Promise<string> {
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

export async function ensureKv(): Promise<string> {
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

export async function ensureR2(): Promise<void> {
  const list = await wrangler(['r2', 'bucket', 'list']);
  if (!new RegExp(`^name:\\s+${R2_BUCKET}$`, 'm').test(list)) {
    console.log(`Creating R2 bucket ${R2_BUCKET}...`);
    await wrangler(['r2', 'bucket', 'create', R2_BUCKET], false);
  }
}

interface WranglerConfig {
  vars?: Record<string, string>;
  d1_databases?: { database_name: string; database_id: string }[];
  kv_namespaces?: { binding: string; id: string }[];
  send_email?: { name: string }[];
}

/**
 * Public URL of the web Worker on workers.dev (for links in emails and the Web Push contact).
 * Null when the account has no workers.dev subdomain yet or the API call fails.
 */
export async function resolveSiteUrl(): Promise<string | null> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (process.env.KYON_URL) return process.env.KYON_URL;
  if (!account || !token) return null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = (await res.json()) as { result?: { subdomain?: string } };
    const sub = body.result?.subdomain;
    return sub ? `https://kyon-web.${sub}.workers.dev` : null;
  } catch (error) {
    console.warn('Cannot read the workers.dev subdomain', error);
    return null;
  }
}

export function writeDeployConfig(
  dir: string,
  ids: { d1: string; kv: string },
  siteUrl: string | null = null,
) {
  const config = parseJsonc<WranglerConfig>(readFileSync(path.join(dir, 'wrangler.jsonc'), 'utf8'));
  for (const db of config.d1_databases ?? []) {
    if (db.database_name === D1_NAME) db.database_id = ids.d1;
  }
  for (const ns of config.kv_namespaces ?? []) ns.id = ids.kv;
  config.vars = {
    ...config.vars,
    KYON_ENV: 'production',
    ...(process.env.KYON_GH_APP_SLUG ? { GITHUB_APP_SLUG: process.env.KYON_GH_APP_SLUG } : {}),
    ...(siteUrl ? { KYON_URL: siteUrl } : {}),
  };
  // Email (Cloudflare Email Service): only with a sender on an onboarded domain, otherwise
  // the app keeps in-app and push notifications (docs/SETUP.md §C).
  const from = process.env.KYON_EMAIL_FROM;
  if (from && path.basename(dir) === 'web') {
    config.send_email = [{ name: 'EMAIL' }];
    config.vars = { ...config.vars, EMAIL_FROM: from };
  }
  writeFileSync(path.join(dir, DEPLOY_CONFIG), JSON.stringify(config, null, 2));
}
