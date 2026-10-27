import { asc, desc, eq, sql } from 'drizzle-orm';
import { localMinutes, timingSafeEqual } from '@kyon/core';
import { project, projectSync } from '@/db/schema';
import { ApiError } from '../errors';
import { json, route } from '../http';
import { notifyDueTasks } from '../notifications/sources';
import { purgeOrphans } from '../tasks/apply';
import { syncProject } from '../tasks/sync';

/** Projects reconciled per cron run: small, to stay within the Free plan's CPU and subrequests. */
const PROJECTS_PER_RUN = 2;

/**
 * POST /api/internal/cron — called by the cron Worker through a service binding, authenticated
 * with a shared secret. Reconciles missed webhooks: projects with pending files first, then the
 * least recently synced.
 */
export const cron = route(async ({ request, env, db }) => {
  const given = request.headers.get('x-kyon-internal') ?? '';
  const secret = env.INTERNAL_SECRET ?? '';
  const enc = new TextEncoder();
  if (!secret || !timingSafeEqual(enc.encode(given), enc.encode(secret)))
    throw new ApiError('not_found');

  const candidates = await db
    .select({ id: project.id })
    .from(project)
    .leftJoin(projectSync, eq(projectSync.projectId, project.id))
    .where(sql`${project.archivedAt} is null`)
    .orderBy(
      desc(sql`coalesce(${projectSync.pending}, '[]') != '[]'`),
      asc(sql`coalesce(${projectSync.lastSyncAt}, 0)`),
    )
    .limit(PROJECTS_PER_RUN);
  const results: Record<string, string> = {};
  for (const c of candidates) {
    try {
      const r = await syncProject(db, env, c.id);
      results[c.id] = r.unchanged ? 'unchanged' : `fetched ${r.fetched}, pending ${r.pending}`;
    } catch (error) {
      results[c.id] = error instanceof Error ? error.message : 'error';
    }
  }
  await purgeOrphans(db);
  // Due-date reminders: from 08:00 Rome time (after the default quiet hours); each one once.
  let reminders = 0;
  if (localMinutes(new Date(), 'Europe/Rome') >= 8 * 60) {
    try {
      reminders = await notifyDueTasks(db, env);
    } catch (error) {
      console.warn('Due reminders failed', error);
    }
  }
  return json({ ok: true, results, reminders });
});
