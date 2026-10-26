import { listUsersForAdmin } from '@/lib/server/accounts';
import { authedRoute, json } from '@/lib/server/http';

export const GET = authedRoute(async ({ db }) => json({ users: await listUsersForAdmin(db) }), {
  admin: true,
});
