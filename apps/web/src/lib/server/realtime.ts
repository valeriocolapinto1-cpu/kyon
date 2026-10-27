import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  GENERAL_ROOM,
  INTERNAL_HEADER,
  ROOM_HEADER,
  projectRoom,
  type RoomEvent,
} from '@kyon/core';

/**
 * Tells everyone in a room that something changed (the clients refetch). Best effort: realtime
 * is a convenience, a failure must never fail the write that triggered it.
 */
export async function publish(env: CloudflareEnv, room: string, event: RoomEvent): Promise<void> {
  const secret = env.INTERNAL_SECRET;
  const namespace = room === GENERAL_ROOM ? env.GENERAL_ROOM : env.PROJECT_ROOM;
  if (!secret || !namespace) return;
  const send = namespace
    .get(namespace.idFromName(room))
    .fetch('https://room/broadcast', {
      method: 'POST',
      headers: {
        [ROOM_HEADER]: room,
        [INTERNAL_HEADER]: secret,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    })
    .then((response) => {
      if (!response.ok) console.warn('realtime publish rejected', response.status);
    })
    .catch((error: unknown) => console.warn('realtime publish failed', error));
  let ctx: { waitUntil(promise: Promise<unknown>): void } | null = null;
  try {
    ctx = getCloudflareContext().ctx;
  } catch (error) {
    // Outside a request (tests, scripts): just wait for it.
    if (!(error instanceof Error)) throw error;
  }
  if (ctx) ctx.waitUntil(send);
  else await send;
}

export const publishTasks = (
  env: CloudflareEnv,
  projectId: string,
  actorId: string | null,
  tasks?: Extract<RoomEvent, { type: 'tasks_changed' }>['tasks'],
) => publish(env, projectRoom(projectId), { type: 'tasks_changed', actorId, tasks });

/** Who has a room open right now (best effort: an error means "nobody", so nothing is lost). */
export async function roomPresence(env: CloudflareEnv, room: string): Promise<string[]> {
  const secret = env.INTERNAL_SECRET;
  const namespace = room === GENERAL_ROOM ? env.GENERAL_ROOM : env.PROJECT_ROOM;
  if (!secret || !namespace) return [];
  try {
    const response = await namespace
      .get(namespace.idFromName(room))
      .fetch('https://room/presence', {
        headers: { [ROOM_HEADER]: room, [INTERNAL_HEADER]: secret },
      });
    if (!response.ok) return [];
    const data = (await response.json()) as { userIds?: unknown };
    return Array.isArray(data.userIds)
      ? data.userIds.filter((id): id is string => typeof id === 'string')
      : [];
  } catch (error) {
    console.warn('realtime presence failed', error);
    return [];
  }
}
