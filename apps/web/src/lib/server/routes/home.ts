import { z } from 'zod';
import { ApiError } from '../errors';
import {
  activityOf,
  finishTour,
  globalSearch,
  hasIcsToken,
  homeData,
  icsFeed,
  memberProjects,
  personProfile,
  revokeIcsToken,
  rotateIcsToken,
  saveLocation,
} from '../home';
import { authedRoute, json, parseJson, rateLimit, route } from '../http';

/** GET /api/home: every Home block in one request. */
export const home = authedRoute(async ({ db, actor }) => json(await homeData(db, actor)));

const Location = z.object({ path: z.string().max(500), title: z.string().max(120) });

/** PUT /api/me/location — "Ritorna dove hai lasciato" (the client debounces it). */
export const location = authedRoute(async ({ request, db, actor }) => {
  const body = await parseJson(request, Location);
  await saveLocation(db, actor, body.path, body.title);
  return json({ ok: true });
});

/** PUT /api/me/tour { done } — finished or skipped; false shows it again. */
export const tour = authedRoute(async ({ request, db, actor }) => {
  const body = await parseJson(request, z.object({ done: z.boolean() }));
  await finishTour(db, actor, body.done);
  return json({ ok: true });
});

/** GET /api/search?q= — projects, tasks and prompts (messages: /api/chat/search). */
export const search = authedRoute(async ({ request, db, actor }) => {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return json(await globalSearch(db, actor, q));
});

/** GET /api/people/:id — a rich profile, limited to what the viewer may see. */
export const person = authedRoute<{ id: string }>(async ({ db, actor }, { id }) =>
  json(await personProfile(db, actor, id)),
);

/** GET /api/activity?before=&project= — the group's history, 30 at a time. */
export const activity = authedRoute(async ({ request, db, actor }) => {
  const url = new URL(request.url);
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam ? new Date(beforeParam) : undefined;
  if (before && Number.isNaN(before.getTime())) throw new ApiError('bad_request');
  const projectId = url.searchParams.get('project');
  const projects = await memberProjects(db, actor.id);
  const scope = projectId ? projects.filter((p) => p.id === projectId) : projects;
  if (projectId && !scope.length) throw new ApiError('not_found');
  const events = await activityOf(db, scope, { limit: 31, before });
  return json({
    events: events.slice(0, 30),
    hasMore: events.length > 30,
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
  });
});

/** GET /api/me/calendar — whether a feed exists (its URL is shown only when created). */
export const calendarState = authedRoute(async ({ db, actor }) =>
  json({ enabled: await hasIcsToken(db, actor) }),
);

/** POST /api/me/calendar — new secret URL (the old one stops working). */
export const calendarRotate = authedRoute(async ({ request, env, db, actor }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const token = await rotateIcsToken(db, actor);
  return json({ url: `${new URL(request.url).origin}/api/calendar/${token}.ics` });
});

/** DELETE /api/me/calendar */
export const calendarRevoke = authedRoute(async ({ db, actor }) => {
  await revokeIcsToken(db, actor);
  return json({ enabled: false });
});

/** GET /api/calendar/:file — public, the secret is in the URL. Calendars poll it. */
export const calendarFeed = route<{ file: string }>(async ({ request, env, db }, { file }) => {
  await rateLimit(env.AUTH_LIMITER, `ics:${file.slice(0, 12)}`);
  const token = file.replace(/\.ics$/, '');
  const body = await icsFeed(db, token, new URL(request.url).origin);
  if (body === null) throw new ApiError('not_found');
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="kyon.ics"',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
});
