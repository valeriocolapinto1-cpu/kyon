import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  GENERAL_ROOM,
  buildPushRequest,
  deliveryChannels,
  isPushEndpoint,
  sanitizeNotificationPrefs,
  shouldGroup,
  type NotificationEvent,
} from '@kyon/core';
import type { Db } from '@/db/client';
import { chatMember, notification, pushSubscription, user } from '@/db/schema';
import { background } from '../background';
import { inChunks } from '../d1';
import { publish, roomPresence } from '../realtime';
import { emailProvider, notificationEmail } from './email';

export interface NotifyItem {
  userId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  /** In-app path, e.g. `/chat?room=…` or `/progetti?id=…&task=…`. */
  url: string;
  projectId?: string | null;
  /** Merge key: unread news with the same key within a few minutes become one. */
  groupKey?: string | null;
  /** Title when merged with `count` items ("3 nuovi messaggi in …"). */
  groupTitle?: (count: number) => string;
  /** Reminder semantics: never twice for the same key. */
  once?: boolean;
  /** Chat room the news comes from (mute). */
  chatRoomId?: string;
  /** Realtime room to check presence: someone looking at it gets no push. */
  liveRoom?: string;
}

function parsePrefs(value: string | null) {
  if (!value) return sanitizeNotificationPrefs(null);
  try {
    return sanitizeNotificationPrefs(JSON.parse(value));
  } catch (error) {
    console.warn('Invalid notification prefs', error);
    return sanitizeNotificationPrefs(null);
  }
}

/** Web Push contact: the site URL, or the admin's address (a push service may need to reach us). */
async function vapidSubject(db: Db, env: CloudflareEnv) {
  if (env.KYON_URL) return env.KYON_URL;
  const [admin] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.role, 'admin'))
    .limit(1);
  return `mailto:${admin?.email ?? 'admin@kyon.invalid'}`;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string | null;
}

/** Sends to every device of a person; gone subscriptions (404/410) are removed. */
export async function sendPush(db: Db, env: CloudflareEnv, userId: string, payload: PushPayload) {
  const keys =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
      : null;
  if (!keys) return { sent: 0, removed: 0 };
  const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  const extra = env.PUSH_TEST_ORIGIN ? [env.PUSH_TEST_ORIGIN] : [];
  const subject = await vapidSubject(db, env);
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    if (!isPushEndpoint(sub.endpoint, extra)) continue;
    try {
      const request = await buildPushRequest(sub, JSON.stringify(payload), keys, subject, {
        urgency: 'high',
        topic: payload.tag ?? undefined,
      });
      const res = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      });
      if (res.status === 404 || res.status === 410) {
        await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
        removed++;
      } else if (res.ok) {
        sent++;
        await db
          .update(pushSubscription)
          .set({ lastSuccessAt: new Date(), failures: 0 })
          .where(eq(pushSubscription.id, sub.id));
      } else {
        console.warn('Push rejected', res.status);
        await db
          .update(pushSubscription)
          .set({ failures: sub.failures + 1 })
          .where(eq(pushSubscription.id, sub.id));
      }
    } catch (error) {
      console.warn('Push failed', error);
    }
  }
  return { sent, removed };
}

const absolute = (env: CloudflareEnv, url: string) =>
  env.KYON_URL ? `${env.KYON_URL}${url}` : null;

/**
 * Delivers news to people, each by their own preferences: in-app (merged when it's the same
 * kind within minutes), push and email after the response. The bell of who got something
 * refreshes through the group room (only ids travel there, never content).
 */
export async function notify(db: Db, env: CloudflareEnv, items: NotifyItem[]) {
  if (!items.length) return;
  const userIds = [...new Set(items.map((i) => i.userId))];
  const people = await inChunks(userIds, (ids) =>
    db
      .select({ id: user.id, email: user.email, prefs: user.notificationPrefs })
      .from(user)
      .where(inArray(user.id, ids)),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const roomIds = [...new Set(items.map((i) => i.chatRoomId).filter((r): r is string => !!r))];
  const muted = roomIds.length
    ? await inChunks(userIds, (ids) =>
        db
          .select({ roomId: chatMember.roomId, userId: chatMember.userId })
          .from(chatMember)
          .where(
            and(
              inArray(chatMember.userId, ids),
              inArray(chatMember.roomId, roomIds),
              eq(chatMember.muted, true),
            ),
          ),
      )
    : [];
  const isMuted = (u: string, r?: string) =>
    Boolean(r && muted.some((m) => m.userId === u && m.roomId === r));
  const presence = new Map<string, Promise<string[]>>();
  const online = (room: string) => {
    if (!presence.has(room)) presence.set(room, roomPresence(env, room));
    return presence.get(room) as Promise<string[]>;
  };

  const now = new Date();
  const notified = new Set<string>();
  const later: Promise<unknown>[] = [];
  const email = emailProvider(env);

  for (const item of items) {
    const person = byId.get(item.userId);
    if (!person) continue;
    const prefs = parsePrefs(person.prefs);
    const channels = deliveryChannels(item.event, prefs, {
      now,
      onlineHere: item.liveRoom ? (await online(item.liveRoom)).includes(item.userId) : false,
      roomMuted: isMuted(item.userId, item.chatRoomId),
    });
    const groupKey = item.groupKey ?? null;
    const [latest] = groupKey
      ? await db
          .select()
          .from(notification)
          .where(and(eq(notification.userId, item.userId), eq(notification.groupKey, groupKey)))
          .orderBy(desc(notification.updatedAt))
          .limit(1)
      : [];
    if (item.once && latest) continue;
    if (!channels.size && !item.once) continue;

    if (channels.has('inapp') || item.once) {
      if (!item.once && latest && shouldGroup(latest, groupKey, now)) {
        const count = latest.count + 1;
        await db
          .update(notification)
          .set({
            count,
            title: item.groupTitle ? item.groupTitle(count) : item.title,
            body: item.body,
            url: item.url,
            updatedAt: now,
          })
          .where(eq(notification.id, latest.id));
      } else {
        await db.insert(notification).values({
          id: crypto.randomUUID(),
          userId: item.userId,
          type: item.event,
          title: item.title,
          body: item.body,
          url: item.url,
          projectId: item.projectId ?? null,
          groupKey,
          // A reminder kept only to remember it was sent: not shown as new.
          readAt: channels.has('inapp') ? null : now,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (channels.has('inapp')) notified.add(item.userId);
    }
    if (channels.has('push'))
      later.push(
        sendPush(db, env, item.userId, {
          title: item.title,
          body: item.body,
          url: item.url,
          tag: groupKey,
        }),
      );
    if (channels.has('email') && email.available)
      later.push(
        email.send({
          to: person.email,
          subject: `Kyon · ${item.title}`,
          text: `${item.body}${absolute(env, item.url) ? `\n\n${absolute(env, item.url)}` : ''}`,
          html: notificationEmail(item.title, item.body, absolute(env, item.url)),
        }),
      );
  }

  if (notified.size) await publish(env, GENERAL_ROOM, { type: 'notify', userIds: [...notified] });
  if (later.length) await background(Promise.allSettled(later));
}
