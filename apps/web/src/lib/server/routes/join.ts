import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CLIENT_KEY_LENGTH, normalizeEmail } from '@kyon/core';
import { user } from '@/db/schema';
import { getAuth } from '@/lib/server/auth';
import { ApiError } from '@/lib/server/errors';
import {
  attachInviteUser,
  checkJoinCode,
  claimInvite,
  countUsers,
  releaseInvite,
} from '@/lib/server/invites';
import { clientIp, json, parseJson, rateLimit, route } from '@/lib/server/http';

/** GET /api/join?code=… → { valid } (no details: unknown, used and expired look the same). */
export const GET = route(async ({ request, env, db }) => {
  await rateLimit(env.AUTH_LIMITER, `join:${clientIp(request)}`);
  const code = new URL(request.url).searchParams.get('code') ?? '';
  const check = await checkJoinCode(db, code, env.ADMIN_BOOTSTRAP_CODE);
  return json({ valid: check.kind !== 'invalid', bootstrap: check.kind === 'bootstrap' });
});

const JoinBody = z.object({
  code: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(60),
  email: z.email().max(254),
  key: z.string().length(CLIENT_KEY_LENGTH),
});

/** POST /api/join: creates the account with a valid invite and signs in (sets the session cookie). */
export const POST = route(async ({ request, env, db }) => {
  await rateLimit(env.AUTH_LIMITER, `join:${clientIp(request)}`);
  const body = await parseJson(request, JoinBody);
  const check = await checkJoinCode(db, body.code, env.ADMIN_BOOTSTRAP_CODE);
  if (check.kind === 'invalid') throw new ApiError('invalid_invite');
  if (check.kind === 'invite' && !(await claimInvite(db, check.id)))
    throw new ApiError('invalid_invite');

  const auth = getAuth(env, new URL(request.url).origin);
  let response: Response;
  try {
    // Internal call: the public /api/auth/sign-up/email endpoint is blocked.
    response = await auth.api.signUpEmail({
      body: { email: normalizeEmail(body.email), password: body.key, name: body.name },
      headers: request.headers,
      asResponse: true,
    });
  } catch (error) {
    if (check.kind === 'invite') await releaseInvite(db, check.id);
    throw error;
  }
  if (!response.ok) {
    if (check.kind === 'invite') await releaseInvite(db, check.id);
    if (response.status === 422 || response.status === 400) {
      throw new ApiError('conflict', 'Esiste già un account con questa email.');
    }
    return response;
  }

  const [created] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalizeEmail(body.email)))
    .limit(1);
  if (created) {
    if (check.kind === 'invite') await attachInviteUser(db, check.id, created.id);
    // The first account ever is the admin (bootstrap code or first invite).
    if (check.kind === 'bootstrap' || (await countUsers(db)) === 1) {
      await db.update(user).set({ role: 'admin' }).where(eq(user.id, created.id));
    }
  }
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of response.headers.getSetCookie()) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
});
