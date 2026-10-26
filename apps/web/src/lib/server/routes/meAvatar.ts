import { eq } from 'drizzle-orm';
import { user } from '@/db/schema';
import { ApiError } from '@/lib/server/errors';
import { authedRoute, json, rateLimit } from '@/lib/server/http';
import { getMe } from '@/lib/server/users';

/** Avatars are resized to 512 px WebP/JPEG in the browser; this is only a safety net. */
const MAX_AVATAR_BYTES = 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const PUT = authedRoute(async ({ request, env, db, auth }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${auth.user.id}`);
  const type = request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const ext = TYPES[type];
  if (!ext) throw new ApiError('unsupported_type');
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_AVATAR_BYTES) throw new ApiError('too_large');
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) throw new ApiError('bad_request');
  if (body.byteLength > MAX_AVATAR_BYTES) throw new ApiError('too_large');

  const [current] = await db
    .select({ avatarKey: user.avatarKey })
    .from(user)
    .where(eq(user.id, auth.user.id));
  const key = `avatars/${auth.user.id}/${crypto.randomUUID()}.${ext}`;
  await env.FILES.put(key, body, { httpMetadata: { contentType: type } });
  await db
    .update(user)
    .set({ avatarKey: key, updatedAt: new Date() })
    .where(eq(user.id, auth.user.id));
  if (current?.avatarKey) await env.FILES.delete(current.avatarKey);
  return json(await getMe(db, auth.user.id));
});

export const DELETE = authedRoute(async ({ env, db, auth }) => {
  const [current] = await db
    .select({ avatarKey: user.avatarKey })
    .from(user)
    .where(eq(user.id, auth.user.id));
  await db
    .update(user)
    .set({ avatarKey: null, updatedAt: new Date() })
    .where(eq(user.id, auth.user.id));
  if (current?.avatarKey) await env.FILES.delete(current.avatarKey);
  return json(await getMe(db, auth.user.id));
});
