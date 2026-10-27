import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  GENERAL_ROOM,
  isPushEndpoint,
  sanitizeNotificationPrefs,
  type Actor,
  type NotificationPrefs,
} from '@kyon/core';
import type { Db } from '@/db/client';
import { notification, pushSubscription, user } from '@/db/schema';
import { it } from '@/lib/i18n/it';
import { chunk } from '../d1';
import { ApiError } from '../errors';
import { emailProvider } from './email';
import { publish } from '../realtime';
import { sendPush } from './notify';

const PAGE = 40;

export async function listNotifications(db: Db, actor: Actor, before?: Date) {
  const rows = await db
    .select()
    .from(notification)
    .where(
      and(
        eq(notification.userId, actor.id),
        before ? lt(notification.updatedAt, before) : undefined,
      ),
    )
    .orderBy(desc(notification.updatedAt))
    .limit(PAGE + 1);
  const [unread] = await db
    .select({ value: sql<number>`count(*)` })
    .from(notification)
    .where(and(eq(notification.userId, actor.id), isNull(notification.readAt)));
  return {
    unread: Number(unread?.value ?? 0),
    hasMore: rows.length > PAGE,
    notifications: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      url: r.url,
      count: r.count,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

/** Marks some (or all) of my notifications read. Others' ids are silently ignored. */
export async function markNotificationsRead(db: Db, actor: Actor, ids: string[] | 'all') {
  const now = new Date();
  if (ids === 'all') {
    await db
      .update(notification)
      .set({ readAt: now })
      .where(and(eq(notification.userId, actor.id), isNull(notification.readAt)));
    return;
  }
  for (const slice of chunk(ids, 90))
    await db
      .update(notification)
      .set({ readAt: now })
      .where(and(eq(notification.userId, actor.id), inArray(notification.id, slice)));
}

export async function getNotificationPrefs(db: Db, actor: Actor): Promise<NotificationPrefs> {
  const [row] = await db
    .select({ prefs: user.notificationPrefs })
    .from(user)
    .where(eq(user.id, actor.id));
  try {
    return sanitizeNotificationPrefs(row?.prefs ? JSON.parse(row.prefs) : null);
  } catch (error) {
    console.warn('Invalid notification prefs', error);
    return sanitizeNotificationPrefs(null);
  }
}

export async function saveNotificationPrefs(db: Db, actor: Actor, raw: unknown) {
  const prefs = sanitizeNotificationPrefs(raw);
  await db
    .update(user)
    .set({ notificationPrefs: JSON.stringify(prefs) })
    .where(eq(user.id, actor.id));
  return prefs;
}

/** What the settings page needs: the VAPID key, my devices, whether email can be sent. */
export async function notificationSetup(db: Db, env: CloudflareEnv, actor: Actor) {
  const devices = await db
    .select({
      id: pushSubscription.id,
      userAgent: pushSubscription.userAgent,
      createdAt: pushSubscription.createdAt,
      endpoint: pushSubscription.endpoint,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, actor.id));
  return {
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
    emailAvailable: emailProvider(env).available,
    // The endpoint lets a browser recognise its own subscription; it's the person's own data.
    devices: devices.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  };
}

export async function subscribePush(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  input: { endpoint: string; p256dh: string; auth: string; userAgent: string | null },
) {
  const extra = env.PUSH_TEST_ORIGIN ? [env.PUSH_TEST_ORIGIN] : [];
  if (!isPushEndpoint(input.endpoint, extra))
    throw new ApiError('bad_request', 'Servizio di notifiche non riconosciuto.');
  const [existing] = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, input.endpoint));
  // A browser re-subscribing (or another account on the same browser) takes the endpoint over.
  if (existing)
    await db
      .update(pushSubscription)
      .set({ userId: actor.id, p256dh: input.p256dh, auth: input.auth, failures: 0 })
      .where(eq(pushSubscription.id, existing.id));
  else
    await db.insert(pushSubscription).values({
      id: crypto.randomUUID(),
      userId: actor.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    });
}

export async function unsubscribePush(db: Db, actor: Actor, endpointOrId: string) {
  await db
    .delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, actor.id),
        sql`(${pushSubscription.endpoint} = ${endpointOrId} OR ${pushSubscription.id} = ${endpointOrId})`,
      ),
    );
}

/** "Invia una prova": in-app and push right away, ignoring quiet hours and preferences. */
export async function sendTestNotification(db: Db, env: CloudflareEnv, actor: Actor) {
  const n = it.notify;
  await db.insert(notification).values({
    id: crypto.randomUUID(),
    userId: actor.id,
    type: 'test',
    title: n.test,
    body: n.testBody,
    url: '/settings#notifications-title',
  });
  const push = await sendPush(db, env, actor.id, {
    title: n.test,
    body: n.testBody,
    url: '/settings#notifications-title',
    tag: 'test',
  });
  await publish(env, GENERAL_ROOM, { type: 'notify', userIds: [actor.id] });
  return push;
}
