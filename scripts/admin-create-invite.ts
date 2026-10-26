/**
 * Creates an invite directly in D1 and prints its link (the code is shown only here).
 *
 *   pnpm admin:create-invite                       # local database (pnpm dev)
 *   pnpm admin:create-invite --remote --url https://kyon-web.<sottodominio>.workers.dev
 *
 * --remote needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, like the deploy.
 */

import { INVITE_TTL_MS, generateInviteCode, hashInviteCode } from '../packages/core/src/index';
import { DEPLOY_CONFIG, ensureD1, ensureKv, webDir, writeDeployConfig } from './lib/cloudflare';
import { localStateDir, run } from './lib/run';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const urlIndex = args.indexOf('--url');
const baseUrl = urlIndex >= 0 ? args[urlIndex + 1] : remote ? undefined : 'http://localhost:3000';
const noteIndex = args.indexOf('--note');
const note = noteIndex >= 0 ? (args[noteIndex + 1] ?? null) : null;

if (remote && !baseUrl) {
  console.error('With --remote pass --url https://kyon-web.<sottodominio>.workers.dev');
  process.exit(1);
}

const code = generateInviteCode();
const now = Date.now();
const escape = (value: string) => value.replace(/'/g, "''");
const sql =
  'insert into invite (id, code_hash, note, created_at, expires_at) values (' +
  `'${crypto.randomUUID()}', '${await hashInviteCode(code)}', ${note ? `'${escape(note)}'` : 'null'}, ${now}, ${now + INVITE_TTL_MS});`;

if (remote) writeDeployConfig(webDir, { d1: await ensureD1(), kv: await ensureKv() });
const target = remote
  ? ['--remote', '--config', DEPLOY_CONFIG]
  : ['--local', '--persist-to', localStateDir];
await run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'kyon-db', ...target, '--command', sql], {
  cwd: webDir,
  capture: true,
});

console.log(`\nInvito creato (vale 7 giorni, una sola volta):\n\n  ${baseUrl}/join?code=${code}\n`);
