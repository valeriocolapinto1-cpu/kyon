import { createResetLink } from '@/lib/server/accounts';
import { authedRoute, json } from '@/lib/server/http';

export const POST = authedRoute<{ id: string }>(
  async ({ request, db }, { id }) => {
    const link = await createResetLink(db, id, new URL(request.url).origin);
    return json({ url: link.url, expiresAt: link.expiresAt.toISOString() }, { status: 201 });
  },
  { admin: true },
);
