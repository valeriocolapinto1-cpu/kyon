import { user } from '@/db/schema';
import { authedRoute, json } from '../http';
import { avatarUrl } from '../users';

/** Everyone in the group (names and avatars only), for pickers and presence. */
export const GET = authedRoute(async ({ db }) => {
  const rows = await db
    .select({ id: user.id, name: user.name, avatarKey: user.avatarKey, statusText: user.statusText })
    .from(user)
    .orderBy(user.name);
  return json({
    people: rows.map((r) => ({ id: r.id, name: r.name, avatarUrl: avatarUrl(r.id, r.avatarKey), statusText: r.statusText })),
  });
});
