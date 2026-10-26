import { revokeAllSessions } from '@/lib/server/accounts';
import { authedRoute, json } from '@/lib/server/http';

/** Logs the user out everywhere. */
export const DELETE = authedRoute<{ id: string }>(
  async ({ db }, { id }) => json({ revoked: await revokeAllSessions(db, id) }),
  { admin: true },
);
