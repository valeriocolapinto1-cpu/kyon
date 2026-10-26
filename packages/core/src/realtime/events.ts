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
  | { type: 'project_changed'; actorId: string | null };

export const ROOM_EVENT_TYPES = ['tasks_changed', 'runs_changed', 'project_changed'] as const;

export const projectRoom = (projectId: string) => `project:${projectId}`;
export const GENERAL_ROOM = 'general';

/** Header the routers set so a room object knows its name (an id can't be turned back into one). */
export const ROOM_HEADER = 'x-kyon-room';
/** Shared-secret header for Worker-to-Worker calls (cron → web, web → realtime). */
export const INTERNAL_HEADER = 'x-kyon-internal';
