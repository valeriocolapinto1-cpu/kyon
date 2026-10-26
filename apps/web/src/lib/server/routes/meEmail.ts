import { z } from 'zod';
import { CLIENT_KEY_LENGTH } from '@kyon/core';
import { changeEmail } from '@/lib/server/accounts';
import { authedRoute, json, parseJson, rateLimit } from '@/lib/server/http';
import { getMe } from '@/lib/server/users';

const Body = z.object({
  currentKey: z.string().length(CLIENT_KEY_LENGTH),
  newEmail: z.email().max(254),
  newKey: z.string().length(CLIENT_KEY_LENGTH),
});

export const POST = authedRoute(async ({ request, env, db, auth }) => {
  await rateLimit(env.AUTH_LIMITER, `email:${auth.user.id}`);
  const body = await parseJson(request, Body);
  await changeEmail(db, auth.user.id, body.currentKey, body.newEmail, body.newKey);
  return json(await getMe(db, auth.user.id));
});
