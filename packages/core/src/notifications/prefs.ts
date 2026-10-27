/** Notification events, channels and the per-person preferences (event × channel, quiet hours). */

export const NOTIFICATION_EVENTS = ['mention', 'assigned', 'due', 'message', 'run'] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ['inapp', 'push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationPrefs {
  matrix: Record<NotificationEvent, Record<NotificationChannel, boolean>>;
  /** "HH:MM" in the person's time zone; start > end means the window crosses midnight. */
  quietStart: string;
  quietEnd: string;
  /** Mentions still push/email during quiet hours. Off by default. */
  mentionsInQuiet: boolean;
  timeZone: string;
}

const row = (inapp: boolean, push: boolean, email: boolean) => ({ inapp, push, email });

/** Email starts off everywhere: on the Free plan it can only reach verified addresses. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  matrix: {
    mention: row(true, true, false),
    assigned: row(true, true, false),
    due: row(true, true, false),
    message: row(true, false, false),
    run: row(true, true, false),
  },
  quietStart: '23:00',
  quietEnd: '08:00',
  mentionsInQuiet: false,
  timeZone: 'Europe/Rome',
};

const isTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

function validZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Whatever is stored or sent becomes a complete, valid set of preferences. */
export function sanitizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof NotificationPrefs, unknown>
  >;
  const matrixIn = (input.matrix && typeof input.matrix === 'object' ? input.matrix : {}) as Record<
    string,
    unknown
  >;
  const matrix = {} as NotificationPrefs['matrix'];
  for (const event of NOTIFICATION_EVENTS) {
    const given = (
      matrixIn[event] && typeof matrixIn[event] === 'object' ? matrixIn[event] : {}
    ) as Record<string, unknown>;
    const fallback = DEFAULT_NOTIFICATION_PREFS.matrix[event];
    matrix[event] = {
      inapp: typeof given.inapp === 'boolean' ? given.inapp : fallback.inapp,
      push: typeof given.push === 'boolean' ? given.push : fallback.push,
      email: typeof given.email === 'boolean' ? given.email : fallback.email,
    };
  }
  return {
    matrix,
    quietStart: isTime(input.quietStart) ? input.quietStart : DEFAULT_NOTIFICATION_PREFS.quietStart,
    quietEnd: isTime(input.quietEnd) ? input.quietEnd : DEFAULT_NOTIFICATION_PREFS.quietEnd,
    mentionsInQuiet:
      typeof input.mentionsInQuiet === 'boolean'
        ? input.mentionsInQuiet
        : DEFAULT_NOTIFICATION_PREFS.mentionsInQuiet,
    timeZone: validZone(input.timeZone) ? input.timeZone : DEFAULT_NOTIFICATION_PREFS.timeZone,
  };
}

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Minutes since local midnight in a time zone. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** Inside [start, end) in local time; a window like 23:00–08:00 crosses midnight. */
export function inQuietHours(now: Date, prefs: NotificationPrefs): boolean {
  const start = minutes(prefs.quietStart);
  const end = minutes(prefs.quietEnd);
  if (start === end) return false;
  const t = localMinutes(now, prefs.timeZone);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

export interface DeliveryContext {
  now: Date;
  /** The person has the room (or project) open right now. */
  onlineHere: boolean;
  /** The person muted the chat the event comes from. */
  roomMuted: boolean;
}

/**
 * Where one event goes for one person. Rules, in order:
 * - a muted chat sends nothing for plain messages (mentions still get through, in-app only);
 * - someone already looking at the chat gets no push or email (and no in-app for messages);
 * - quiet hours stop push and email, except mentions when the person allowed them.
 */
export function deliveryChannels(
  event: NotificationEvent,
  prefs: NotificationPrefs,
  ctx: DeliveryContext,
): Set<NotificationChannel> {
  const wanted = prefs.matrix[event];
  const channels = new Set<NotificationChannel>(
    NOTIFICATION_CHANNELS.filter((channel) => wanted[channel]),
  );
  if (ctx.roomMuted) {
    if (event === 'message') return new Set();
    if (event === 'mention') {
      channels.delete('push');
      channels.delete('email');
    }
  }
  if (ctx.onlineHere && (event === 'message' || event === 'mention')) {
    channels.delete('push');
    channels.delete('email');
    if (event === 'message') channels.delete('inapp');
  }
  if (inQuietHours(ctx.now, prefs) && !(event === 'mention' && prefs.mentionsInQuiet)) {
    channels.delete('push');
    channels.delete('email');
  }
  return channels;
}

/** Same kind of news within this window is merged into one notification ("3 nuovi messaggi"). */
export const GROUP_WINDOW_MS = 10 * 60_000;

export function shouldGroup(
  existing: { groupKey: string | null; readAt: Date | null; updatedAt: Date } | null,
  groupKey: string | null,
  now: Date,
): boolean {
  return Boolean(
    existing &&
    groupKey &&
    existing.groupKey === groupKey &&
    !existing.readAt &&
    now.getTime() - existing.updatedAt.getTime() < GROUP_WINDOW_MS,
  );
}
