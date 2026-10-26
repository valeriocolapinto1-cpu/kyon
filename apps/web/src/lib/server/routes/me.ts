import { z } from 'zod';
import { getMe, updateMe } from '@/lib/server/users';
import { authedRoute, json, parseJson, rateLimit } from '@/lib/server/http';

export const GET = authedRoute(async ({ db, auth }) => json(await getMe(db, auth.user.id)));

const Patch = z
  .object({
    name: z.string().trim().min(1).max(60),
    bio: z.string().trim().max(280).nullable(),
    statusText: z.string().trim().max(60).nullable(),
    preferences: z.record(z.string(), z.unknown()),
    homeLayout: z.array(z.object({ id: z.string().max(40), hidden: z.boolean() })).max(20),
  })
  .partial();

export const PATCH = authedRoute(async ({ request, env, db, auth }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${auth.user.id}`);
  await updateMe(db, auth.user.id, await parseJson(request, Patch));
  return json(await getMe(db, auth.user.id));
});
