import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sql } from 'drizzle-orm';
import { createDb } from '@/db/client';

export const dynamic = 'force-dynamic';

/** Liveness probe that also proves the D1 binding works. Never exposes data. */
export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const db = createDb(env.DB);
  try {
    await db.run(sql`select 1`);
    return Response.json({ ok: true, db: 'up' });
  } catch (error) {
    console.error('health: D1 check failed', error);
    return Response.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
