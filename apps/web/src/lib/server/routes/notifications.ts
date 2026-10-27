import { z } from 'zod';
import { ApiError } from '../errors';
import { authedRoute, json, parseJson, rateLimit } from '../http';
import {
  getNotificationPrefs,
  listNotifications,
  markNotificationsRead,
  notificationSetup,
  saveNotificationPrefs,
  sendTestNotification,
  subscribePush,
  unsubscribePush,
} from '../notifications/center';

/** GET /api/notifications?before= */
export const list = authedRoute(async ({ request, db, actor }) => {
  const before = new URL(request.url).searchParams.get('before');
  const date = before ? new Date(before) : undefined;
  if (date && Number.isNaN(date.getTime())) throw new ApiError('bad_request');
  return json(await listNotifications(db, actor, date));
});

const Read = z.object({ ids: z.union([z.array(z.string().max(64)).max(200), z.literal('all')]) });

/** POST /api/notifications/read { ids: [...] | 'all' } */
export const read = authedRoute(async ({ request, db, actor }) => {
  const body = await parseJson(request, Read);
  await markNotificationsRead(db, actor, body.ids);
  return json({ ok: true });
});

/** GET/PUT /api/me/notifications — event × channel, quiet hours. */
export const prefs = {
  GET: authedRoute(async ({ db, actor }) => json(await getNotificationPrefs(db, actor))),
  PUT: authedRoute(async ({ request, env, db, actor }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const body = await parseJson(request, z.record(z.string(), z.unknown()));
    return json(await saveNotificationPrefs(db, actor, body));
  }),
};

/** GET /api/notifications/setup */
export const setup = authedRoute(async ({ env, db, actor }) =>
  json(await notificationSetup(db, env, actor)),
);

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/);
const Subscribe = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: b64url.min(80).max(100), auth: b64url.min(16).max(40) }),
});

/** POST /api/push/subscriptions — the browser's PushSubscription.toJSON(). */
export const subscribe = authedRoute(async ({ request, env, db, actor }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(request, Subscribe);
  await subscribePush(db, env, actor, {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: request.headers.get('user-agent'),
  });
  return json({ ok: true }, { status: 201 });
});

/** DELETE /api/push/subscriptions { endpoint } (or a device id) */
export const unsubscribe = authedRoute(async ({ request, db, actor }) => {
  const body = await parseJson(request, z.object({ endpoint: z.string().min(1).max(1000) }));
  await unsubscribePush(db, actor, body.endpoint);
  return json({ ok: true });
});

/** POST /api/notifications/test */
export const test = authedRoute(async ({ env, db, actor }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  return json(await sendTestNotification(db, env, actor));
});
