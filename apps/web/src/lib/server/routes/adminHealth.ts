import { z } from 'zod';
import { exportData, exportMarkdown, healthReport } from '../admin';
import { authedRoute, json, rateLimit } from '../http';

/** GET /api/admin/health — the "Salute" page. */
export const health = authedRoute(
  async ({ env, db, actor }) => json(await healthReport(db, env, actor)),
  { admin: true },
);

const Format = z.enum(['json', 'md']).catch('json');

/** GET /api/admin/export?format=json|md — a download of what the admin can see. */
export const exportRoute = authedRoute(
  async ({ request, env, db, actor }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const format = Format.parse(new URL(request.url).searchParams.get('format'));
    const data = await exportData(db, actor);
    const day = data.exportedAt.slice(0, 10);
    const body = format === 'md' ? exportMarkdown(data) : JSON.stringify(data, null, 2);
    return new Response(body, {
      headers: {
        'content-type':
          format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="kyon-${day}.${format}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  },
  { admin: true },
);
