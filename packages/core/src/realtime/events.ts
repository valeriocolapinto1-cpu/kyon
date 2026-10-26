/** Messages a room sends to its clients. Kept tiny: clients refetch what changed. */
export type RoomEvent =
  | {
      type: 'tasks_changed';
      /** Who caused it (null = GitHub push or the system). */
      actorId: string | null;
      /** Tasks affected and their assignees, to announce only what concerns the viewer. */
      tasks?: { id: string; text: string; assigneeId: string | null; column?: string }[];
    }
  | {
      type: 'runs_changed';
      actorId: string | null;
      /** Set when a merge closed a task: its launcher gets a toast with "Annulla chiusura". */
      closed?: { runId: string; taskText: string; launchedBy: string | null };
    }
  | {
      type: 'chat';
      roomId: string;
      action: 'message' | 'edit' | 'delete' | 'reaction' | 'pin' | 'room';
      actorId: string | null;
      /** The message as everyone sees it (a view, no private fields). */
      message?: unknown;
    }
  /** Sent by the room itself (never by the web Worker): who is connected, who is typing. */
  | { type: 'presence'; userIds: string[] }
  | { type: 'typing'; roomId: string; userId: string }
  | { type: 'project_changed'; actorId: string | null };

/** What a client may send on the socket (anything else is ignored). */
export type ClientRoomMessage = { type: 'typing'; roomId: string };

export function parseClientMessage(raw: string): ClientRoomMessage | null {
  if (raw.length > 200) return null;
  try {
    const value = JSON.parse(raw) as { type?: unknown; roomId?: unknown };
    if (
      value.type === 'typing' &&
      typeof value.roomId === 'string' &&
      /^[a-z]+(:[A-Za-z0-9-]{1,64})?$/.test(value.roomId)
    )
      return { type: 'typing', roomId: value.roomId };
  } catch {
    return null;
  }
  return null;
}

export const ROOM_EVENT_TYPES = [
  'tasks_changed',
  'runs_changed',
  'chat',
  'presence',
  'typing',
  'project_changed',
] as const;

export const projectRoom = (projectId: string) => `project:${projectId}`;
export const GENERAL_ROOM = 'general';

/** Header the routers set so a room object knows its name (an id can't be turned back into one). */
export const ROOM_HEADER = 'x-kyon-room';
/** Shared-secret header for Worker-to-Worker calls (cron → web, web → realtime). */
export const INTERNAL_HEADER = 'x-kyon-internal';
