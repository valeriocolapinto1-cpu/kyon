import { ApiError } from '@/lib/server/errors';
import { revokeInvite } from '@/lib/server/invites';
import { authedRoute, json } from '@/lib/server/http';

export const DELETE = authedRoute<{ id: string }>(
  async ({ db }, { id }) => {
    if (!(await revokeInvite(db, id))) throw new ApiError('not_found');
    return json({ ok: true });
  },
  { admin: true },
);
