import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { deriveClientKey, normalizeEmail } from '@kyon/core';
import { createDb } from '@/db/client';
import { session, user } from '@/db/schema';
import { CookieJar, createTestD1, fakeLimiter, testEnv } from '@/test/d1';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const { GET: joinGet, POST: joinPost } = await import('@/lib/server/routes/join');
const authRoute = await import('@/lib/server/routes/auth');
const { GET: meGet } = await import('@/lib/server/routes/me');
const { GET: invitesGet, POST: invitesPost } = await import('@/lib/server/routes/adminInvites');
const { PATCH: userPatch } = await import('@/lib/server/routes/adminUser');
const { POST: resetLinkPost } = await import('@/lib/server/routes/adminResetLink');
const { GET: resetGet } = await import('@/lib/server/routes/reset');
const { POST: emailPost } = await import('@/lib/server/routes/meEmail');

const ORIGIN = 'http://localhost:8787';
const BOOTSTRAP = 'bootstrap-code-for-tests';
const FAST = 1000; // client-side iterations, low for test speed
const key = (email: string, password: string) => deriveClientKey(email, password, FAST);

function req(path: string, init: RequestInit & { jar?: CookieJar } = {}) {
  const headers = new Headers(init.headers);
  if (init.jar) headers.set('cookie', init.jar.header());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
// Test-only: response bodies are asserted field by field, a precise type adds nothing here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response | Promise<Response>): Promise<any> => (await res).json();

async function join(code: string, email: string, password: string, name = 'Test') {
  const jar = new CookieJar();
  const res = await joinPost(
    req('/api/join', {
      method: 'POST',
      body: JSON.stringify({ code, name, email, key: await key(email, password) }),
    }),
  );
  jar.store(res);
  return { res, jar };
}

async function signIn(email: string, password: string) {
  const jar = new CookieJar();
  const res = await authRoute.POST(
    // Like the real client: the email is normalized before sending.
    req('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: normalizeEmail(email), password: await key(email, password) }),
    }),
  );
  jar.store(res);
  return { res, jar };
}

describe('auth: invites, sign-in, roles, reset', () => {
  let dispose: () => Promise<void>;
  let admin: CookieJar;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: BOOTSTRAP });
  });
  afterAll(() => dispose());
  beforeEach(() => {
    env.AUTH_LIMITER = fakeLimiter();
  });

  it('rejects joining without a valid invite', async () => {
    expect(await body(joinGet(req('/api/join?code=AAAA-BBBB-CCCC-DDDD')))).toEqual({
      valid: false,
      bootstrap: false,
    });
    const { res } = await join('AAAA-BBBB-CCCC-DDDD', 'x@kyon.test', 'password lunga 1');
    expect(res.status).toBe(400);
    expect((await body(res)).error.code).toBe('invalid_invite');
  });

  it('keeps public sign-up closed', async () => {
    const res = await authRoute.POST(
      req('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.it', password: 'x'.repeat(64), name: 'x' }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('bootstraps the first account as admin, then the bootstrap code stops working', async () => {
    expect(await body(joinGet(req(`/api/join?code=${BOOTSTRAP}`)))).toEqual({
      valid: true,
      bootstrap: true,
    });
    const first = await join(BOOTSTRAP, 'Valerio@Kyon.test', 'password di valerio');
    expect(first.res.status).toBe(200);
    admin = first.jar;
    const me = await body(meGet(req('/api/me', { jar: admin })));
    expect(me).toMatchObject({ email: 'valerio@kyon.test', role: 'admin' });

    const second = await join(BOOTSTRAP, 'other@kyon.test', 'password di altri');
    expect(second.res.status).toBe(400);
  });

  it('lets the admin invite someone, once', async () => {
    const created = await invitesPost(
      req('/api/admin/invites', {
        method: 'POST',
        jar: admin,
        body: JSON.stringify({ note: 'Christian' }),
      }),
    );
    expect(created.status).toBe(201);
    const { code, url } = await body(created);
    expect(url).toBe(`${ORIGIN}/join?code=${code}`);

    const christian = await join(
      code.toLowerCase().replace(/-/g, ' '),
      'christian@kyon.test',
      'password di christian',
      'Christian',
    );
    expect(christian.res.status).toBe(200);
    const me = await body(meGet(req('/api/me', { jar: christian.jar })));
    expect(me).toMatchObject({ name: 'Christian', role: 'user' });

    const again = await join(code, 'third@kyon.test', 'password del terzo');
    expect(again.res.status).toBe(400);

    const list = await body(invitesGet(req('/api/admin/invites', { jar: admin })));
    expect(list.invites[0]).toMatchObject({
      note: 'Christian',
      state: 'used',
      usedByName: 'Christian',
    });
  });

  it('protects admin routes and requires login', async () => {
    const { jar } = await signIn('christian@kyon.test', 'password di christian');
    expect((await invitesGet(req('/api/admin/invites', { jar }))).status).toBe(403);
    expect((await invitesGet(req('/api/admin/invites'))).status).toBe(401);
    expect((await meGet(req('/api/me'))).status).toBe(401);
  });

  it('signs in with the derived key and refuses a wrong password', async () => {
    expect((await signIn('christian@kyon.test', 'password di christian')).res.status).toBe(200);
    expect((await signIn('CHRISTIAN@kyon.test ', 'password di christian')).res.status).toBe(200);
    expect((await signIn('christian@kyon.test', 'password sbagliata')).res.status).toBe(401);
  });

  it('rate limits sign-in attempts per IP', async () => {
    env.AUTH_LIMITER = fakeLimiter(2);
    await signIn('christian@kyon.test', 'sbagliata 1234');
    await signIn('christian@kyon.test', 'sbagliata 1234');
    const third = await signIn('christian@kyon.test', 'password di christian');
    expect(third.res.status).toBe(429);
  });

  it('rejects cross-origin writes', async () => {
    const res = await invitesPost(
      req('/api/admin/invites', {
        method: 'POST',
        jar: admin,
        body: '{}',
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('never demotes the last admin', async () => {
    const db = createDb(env.DB);
    const [valerio] = await db.select().from(user).where(eq(user.email, 'valerio@kyon.test'));
    const res = await userPatch(
      req(`/api/admin/users/${valerio?.id}`, {
        method: 'PATCH',
        jar: admin,
        body: JSON.stringify({ role: 'user' }),
      }),
      params({ id: valerio?.id ?? '' }),
    );
    expect(res.status).toBe(409);
  });

  it('resets a password with an admin link and revokes old sessions', async () => {
    const db = createDb(env.DB);
    const [christian] = await db.select().from(user).where(eq(user.email, 'christian@kyon.test'));
    const id = christian?.id ?? '';
    const before = await signIn('christian@kyon.test', 'password di christian');

    const link = await body(
      resetLinkPost(
        req(`/api/admin/users/${id}/reset-link`, { method: 'POST', jar: admin }),
        params({ id }),
      ),
    );
    const token = new URL(String(link.url)).searchParams.get('token') ?? '';
    const info = await body(resetGet(req(`/api/reset/${token}`), params({ token })));
    expect(info.email).toBe('christian@kyon.test');

    const reset = await authRoute.POST(
      req('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: await key(info.email, 'nuova password lunga') }),
      }),
    );
    expect(reset.status).toBe(200);
    expect((await signIn('christian@kyon.test', 'password di christian')).res.status).toBe(401);
    expect((await signIn('christian@kyon.test', 'nuova password lunga')).res.status).toBe(200);
    // The old session is gone.
    const remaining = await db.select().from(session).where(eq(session.userId, id));
    expect(remaining.some((s) => before.jar.header().includes(s.token))).toBe(false);
    // The link works only once.
    expect((await resetGet(req(`/api/reset/${token}`), params({ token }))).status).toBe(404);
  });

  it('changes email with the current password', async () => {
    const { jar } = await signIn('christian@kyon.test', 'nuova password lunga');
    const wrong = await emailPost(
      req('/api/me/email', {
        method: 'POST',
        jar,
        body: JSON.stringify({
          currentKey: await key('christian@kyon.test', 'non è questa'),
          newEmail: 'chris@kyon.test',
          newKey: await key('chris@kyon.test', 'nuova password lunga'),
        }),
      }),
    );
    expect(wrong.status).toBe(400);
    const ok = await emailPost(
      req('/api/me/email', {
        method: 'POST',
        jar,
        body: JSON.stringify({
          currentKey: await key('christian@kyon.test', 'nuova password lunga'),
          newEmail: 'Chris@kyon.test',
          newKey: await key('chris@kyon.test', 'nuova password lunga'),
        }),
      }),
    );
    expect(ok.status).toBe(200);
    expect((await signIn('chris@kyon.test', 'nuova password lunga')).res.status).toBe(200);
  });

  it('rotates a session token older than a week', async () => {
    const { jar } = await signIn('valerio@kyon.test', 'password di valerio');
    const db = createDb(env.DB);
    const oldToken = jar.header().match(/session_token=([^.;]+)/)?.[1] ?? '';
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(session.token, oldToken));
    const res = await authRoute.POST(req('/api/auth/rotate-session', { method: 'POST', jar }));
    expect(await body(res)).toEqual({ rotated: true });
    const stale = new CookieJar();
    stale.store(new Response(null, { headers: [['set-cookie', jar.header()]] }));
    jar.store(res);
    expect(await db.select().from(session).where(eq(session.token, oldToken))).toHaveLength(0);
    expect((await meGet(req('/api/me', { jar }))).status).toBe(200);
    expect((await meGet(req('/api/me', { jar: stale }))).status).toBe(401);
  });
});
