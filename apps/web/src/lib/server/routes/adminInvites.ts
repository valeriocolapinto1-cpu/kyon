import { z } from 'zod';
import { createInvite, listInvites } from '@/lib/server/invites';
import { authedRoute, json, parseJson, rateLimit } from '@/lib/server/http';

export const GET = authedRoute(async ({ db }) => json({ invites: await listInvites(db) }), {
  admin: true,
});

const Body = z.object({ note: z.string().trim().max(80).nullable().optional() });

/** Returns the code once: only its hash is stored. */
export const POST = authedRoute(
  async ({ request, env, db, auth }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${auth.user.id}`);
    const { note } = await parseJson(request, Body);
    const created = await createInvite(db, auth.user.id, note ?? null);
    const origin = new URL(request.url).origin;
    return json(
      {
        ...created,
        url: `${origin}/join?code=${created.code}`,
        expiresAt: created.expiresAt.toISOString(),
      },
      { status: 201 },
    );
  },
  { admin: true },
);
