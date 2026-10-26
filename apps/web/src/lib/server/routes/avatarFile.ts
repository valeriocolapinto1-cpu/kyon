import { eq } from 'drizzle-orm';
import { user } from '@/db/schema';
import { ApiError } from '@/lib/server/errors';
import { authedRoute } from '@/lib/server/http';

/** Avatars are visible to every member of the group (logged-in users only). */
export const GET = authedRoute<{ userId: string }>(async ({ env, db }, { userId }) => {
  const [row] = await db
    .select({ avatarKey: user.avatarKey })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row?.avatarKey) throw new ApiError('not_found');
  const object = await env.FILES.get(row.avatarKey);
  if (!object) throw new ApiError('not_found');
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
});
