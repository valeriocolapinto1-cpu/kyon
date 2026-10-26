import { z } from 'zod';
import { setRole } from '@/lib/server/accounts';
import { authedRoute, json, parseJson } from '@/lib/server/http';

const Body = z.object({ role: z.enum(['admin', 'user']) });

export const PATCH = authedRoute<{ id: string }>(
  async ({ request, db }, { id }) => {
    const { role } = await parseJson(request, Body);
    await setRole(db, id, role);
    return json({ ok: true });
  },
  { admin: true },
);
