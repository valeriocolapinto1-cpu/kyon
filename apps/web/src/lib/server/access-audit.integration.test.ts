import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestD1, testEnv } from '@/test/d1';
import { ORIGIN } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const { api, routes } = await import('./router');

/**
 * Routes reachable without a session, each with the reason. Everything else must refuse an
 * anonymous request (401, or 404 where existence itself is private) — a new route can't slip
 * through without being listed here on purpose.
 */
const PUBLIC: Record<string, string> = {
  '/api/health': 'liveness probe, no data',
  '/api/auth/*': 'sign-in, sign-up through invites, password reset (Better Auth)',
  '/api/join': 'invite check and sign-up (the invite code is the credential)',
  '/api/reset/:token': 'password reset (the token is the credential)',
  '/api/github/webhook': 'GitHub webhook (HMAC signature is the credential)',
  '/api/github/callback': 'OAuth return (state cookie is checked inside)',
  '/api/github/setup': 'GitHub App setup redirect (no data)',
  '/api/calendar/:file': '.ics feed (the secret in the URL is the credential)',
  '/api/internal/cron': 'cron Worker (shared secret header)',
  '/api/files/avatars/:userId': 'avatars are shown to the group (checked inside)',
};

const sample = (path: string) =>
  path
    .replace('/*', '/get-session')
    .replace(/:file/, 'x.ics')
    .replace(/:[A-Za-z]+/g, '00000000-0000-0000-0000-000000000000');

describe('access audit', () => {
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { FILES: d1.files });
  });
  afterAll(async () => {
    await dispose();
  });

  it('every non-public route refuses anonymous requests', async () => {
    const leaks: string[] = [];
    for (const [path, module] of routes) {
      if (PUBLIC[path]) continue;
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        if (typeof module[method] !== 'function') continue;
        const res = await api.fetch(
          new Request(`${ORIGIN}${sample(path)}`, {
            method,
            headers: { origin: ORIGIN, 'content-type': 'application/json' },
            body: method === 'GET' ? undefined : '{}',
          }),
        );
        if (![401, 403, 404].includes(res.status)) leaks.push(`${method} ${path} → ${res.status}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('writes from another origin are refused', async () => {
    const res = await api.fetch(
      new Request(`${ORIGIN}/api/me`, {
        method: 'PATCH',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{"name":"x"}',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('the public list only names real routes', () => {
    const paths = new Set(routes.map(([p]) => p));
    expect(Object.keys(PUBLIC).filter((p) => !paths.has(p))).toEqual([]);
  });
});
