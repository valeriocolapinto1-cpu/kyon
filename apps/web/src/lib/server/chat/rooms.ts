import { and, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  GENERAL_ROOM,
  can,
  projectRoom,
  type Actor,
  type ProjectRole,
  type RoomEvent,
} from '@kyon/core';
import type { Db } from '@/db/client';
import {
  chatMember,
  chatMessage,
  chatRoom,
  project,
  projectMember,
  taskMeta,
  user,
} from '@/db/schema';
import { inChunks } from '../d1';
import { ApiError } from '../errors';
import { projectResource } from '../projects';
import { publish } from '../realtime';

export type RoomKind = 'general' | 'project' | 'thread' | 'task';
type RoomRow = typeof chatRoom.$inferSelect;

export interface RoomAccess {
  room: RoomRow;
  canRead: boolean;
  canWrite: boolean;
  /** Pin, rename and delete threads: contributors of the project (everyone in the group chat). */
  canModerate: boolean;
  project: typeof project.$inferSelect | null;
}

function parseRoomId(roomId: string): { kind: RoomKind; ref: string | null } {
  if (roomId === GENERAL_ROOM) return { kind: 'general', ref: null };
  const [kind, ref] = roomId.split(':');
  if (
    (kind === 'project' || kind === 'thread' || kind === 'task') &&
    ref &&
    /^[A-Za-z0-9-]{1,64}$/.test(ref)
  )
    return { kind, ref };
  throw new ApiError('not_found');
}

async function membership(db: Db, actor: Actor, projectId: string) {
  const [row] = await db
    .select({ project, role: projectMember.role })
    .from(project)
    .leftJoin(
      projectMember,
      and(eq(projectMember.projectId, project.id), eq(projectMember.userId, actor.id)),
    )
    .where(eq(project.id, projectId))
    .limit(1);
  if (!row) return null;
  return { project: row.project, role: (row.role ?? null) as ProjectRole | null };
}

/**
 * Loads (and creates on first use) a room and decides what the actor can do there. Group chat:
 * everyone. Project chat and discussions: members read, contributors write. Task comments:
 * members read, `project:comment` writes (viewers only if the owner allows it). Non-members get
 * 404, as everywhere else.
 */
export async function roomAccess(db: Db, actor: Actor, roomId: string): Promise<RoomAccess> {
  const { kind, ref } = parseRoomId(roomId);
  let [room] = await db.select().from(chatRoom).where(eq(chatRoom.id, roomId)).limit(1);

  if (kind === 'general') {
    if (!room) {
      await db.insert(chatRoom).values({ id: roomId, kind }).onConflictDoNothing();
      [room] = await db.select().from(chatRoom).where(eq(chatRoom.id, roomId)).limit(1);
    }
    if (!room) throw new ApiError('internal');
    const ok = can(actor, 'group:chat', { kind: 'group' });
    return { room, canRead: ok, canWrite: ok, canModerate: ok, project: null };
  }

  let projectId: string | null = room?.projectId ?? null;
  let taskId: string | null = null;
  if (!room) {
    if (kind === 'project') projectId = ref;
    if (kind === 'task' && ref) {
      const [task] = await db
        .select({ projectId: taskMeta.projectId })
        .from(taskMeta)
        .where(eq(taskMeta.id, ref))
        .limit(1);
      projectId = task?.projectId ?? null;
      taskId = ref;
    }
    // Threads are created explicitly (createThread): an unknown one does not exist.
  }
  if (!projectId) throw new ApiError('not_found');
  const access = await membership(db, actor, projectId);
  if (!access?.role) throw new ApiError('not_found');
  const resource = projectResource(access.project, access.role);
  if (!can(actor, 'project:view', resource)) throw new ApiError('not_found');

  if (!room) {
    await db
      .insert(chatRoom)
      .values({ id: roomId, kind, projectId, taskId, createdBy: actor.id })
      .onConflictDoNothing();
    [room] = await db.select().from(chatRoom).where(eq(chatRoom.id, roomId)).limit(1);
    if (!room) throw new ApiError('internal');
  }
  const canWrite =
    room.kind === 'task'
      ? can(actor, 'project:comment', resource)
      : can(actor, 'project:chat', resource);
  return {
    room,
    canRead: true,
    canWrite,
    canModerate: can(actor, 'project:chat', resource),
    project: access.project,
  };
}

/** The realtime room that carries a chat room's events. */
export const liveRoomOf = (room: Pick<RoomRow, 'kind' | 'projectId'>) =>
  room.kind === 'general' || !room.projectId ? GENERAL_ROOM : projectRoom(room.projectId);

export const publishChat = (
  env: CloudflareEnv,
  room: Pick<RoomRow, 'id' | 'kind' | 'projectId'>,
  event: Omit<Extract<RoomEvent, { type: 'chat' }>, 'type' | 'roomId'>,
) => publish(env, liveRoomOf(room), { type: 'chat', roomId: room.id, ...event });

export async function createThread(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  title: string,
) {
  const access = await membership(db, actor, projectId);
  if (!access?.role) throw new ApiError('not_found');
  if (!can(actor, 'project:chat', projectResource(access.project, access.role)))
    throw new ApiError('forbidden');
  const id = `thread:${crypto.randomUUID()}`;
  await db.insert(chatRoom).values({ id, kind: 'thread', projectId, title, createdBy: actor.id });
  await publishChat(env, { id, kind: 'thread', projectId }, { action: 'room', actorId: actor.id });
  return { id };
}

export async function renameThread(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  roomId: string,
  title: string,
) {
  const access = await roomAccess(db, actor, roomId);
  if (access.room.kind !== 'thread' || !access.canModerate) throw new ApiError('forbidden');
  await db.update(chatRoom).set({ title }).where(eq(chatRoom.id, roomId));
  await publishChat(env, access.room, { action: 'room', actorId: actor.id });
}

/**
 * The Chat page list: group chat first, then each project's chat and discussions the actor can
 * see (most recent first), with unread counts (others' messages after the last one read).
 */
export async function listRooms(db: Db, actor: Actor) {
  await roomAccess(db, actor, GENERAL_ROOM); // creates it on first use
  const memberships = await db
    .select({
      projectId: projectMember.projectId,
      name: project.name,
      archivedAt: project.archivedAt,
    })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .where(eq(projectMember.userId, actor.id));
  const projectIds = memberships.map((m) => m.projectId);
  const rooms = [
    ...(await db.select().from(chatRoom).where(eq(chatRoom.id, GENERAL_ROOM))),
    ...(await inChunks(projectIds, (ids) =>
      db
        .select()
        .from(chatRoom)
        .where(and(inArray(chatRoom.projectId, ids), ne(chatRoom.kind, 'task'))),
    )),
  ];
  // Project chats nobody wrote in yet still show up.
  for (const m of memberships)
    if (!rooms.some((r) => r.id === projectRoom(m.projectId)))
      rooms.push({
        id: projectRoom(m.projectId),
        kind: 'project',
        projectId: m.projectId,
        taskId: null,
        title: null,
        createdBy: null,
        lastSeq: 0,
        lastMessageAt: null,
        createdAt: new Date(0),
      });
  const ids = rooms.map((r) => r.id);
  const [states, unread, lastMessages] = await Promise.all([
    inChunks(ids, (slice) =>
      db
        .select()
        .from(chatMember)
        .where(and(eq(chatMember.userId, actor.id), inArray(chatMember.roomId, slice))),
    ),
    inChunks(ids, (slice) =>
      db
        .select({ roomId: chatMessage.roomId, n: sql<number>`count(*)` })
        .from(chatMessage)
        .leftJoin(
          chatMember,
          and(eq(chatMember.roomId, chatMessage.roomId), eq(chatMember.userId, actor.id)),
        )
        .where(
          and(
            inArray(chatMessage.roomId, slice),
            isNull(chatMessage.deletedAt),
            ne(chatMessage.authorId, actor.id),
            gt(chatMessage.seq, sql`coalesce(${chatMember.lastReadSeq}, 0)`),
          ),
        )
        .groupBy(chatMessage.roomId),
    ),
    inChunks(
      rooms.filter((r) => r.lastSeq > 0),
      (slice) =>
        Promise.all(
          slice.map((r) =>
            db
              .select({
                roomId: chatMessage.roomId,
                body: chatMessage.body,
                deletedAt: chatMessage.deletedAt,
                authorName: user.name,
              })
              .from(chatMessage)
              .leftJoin(user, eq(user.id, chatMessage.authorId))
              .where(eq(chatMessage.roomId, r.id))
              .orderBy(desc(chatMessage.seq))
              .limit(1),
          ),
        ).then((rows) => rows.flat()),
    ),
  ]);
  const projectName = new Map(memberships.map((m) => [m.projectId, m]));
  const order = (r: (typeof rooms)[number]) =>
    r.kind === 'general' ? Number.MAX_SAFE_INTEGER : (r.lastMessageAt?.getTime() ?? 0);
  return rooms
    .filter((r) => r.kind === 'general' || !projectName.get(r.projectId ?? '')?.archivedAt)
    .sort((a, b) => order(b) - order(a))
    .map((r) => {
      const last = lastMessages.find((m) => m.roomId === r.id);
      return {
        id: r.id,
        kind: r.kind as RoomKind,
        projectId: r.projectId,
        projectName: r.projectId ? (projectName.get(r.projectId)?.name ?? null) : null,
        title: r.title,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        unread: Number(unread.find((u) => u.roomId === r.id)?.n ?? 0),
        muted: states.find((s) => s.roomId === r.id)?.muted ?? false,
        last: last
          ? { author: last.authorName ?? '', text: last.deletedAt ? '' : last.body.slice(0, 140) }
          : null,
      };
    });
}

export async function markRead(db: Db, actor: Actor, roomId: string, seq: number) {
  const { room } = await roomAccess(db, actor, roomId);
  const value = Math.min(seq, room.lastSeq);
  await db
    .insert(chatMember)
    .values({ roomId, userId: actor.id, lastReadSeq: value })
    .onConflictDoUpdate({
      target: [chatMember.roomId, chatMember.userId],
      // Never go backwards (two tabs reading at different speeds).
      set: { lastReadSeq: sql`max(${chatMember.lastReadSeq}, ${value})` },
    });
}

export async function setMuted(db: Db, actor: Actor, roomId: string, muted: boolean) {
  await roomAccess(db, actor, roomId);
  await db
    .insert(chatMember)
    .values({ roomId, userId: actor.id, muted })
    .onConflictDoUpdate({ target: [chatMember.roomId, chatMember.userId], set: { muted } });
}

/** The room's people (for @mentions): group members, or the project's members. */
export async function roomPeople(db: Db, access: RoomAccess) {
  if (!access.room.projectId)
    return db.select({ id: user.id, name: user.name, avatarKey: user.avatarKey }).from(user);
  return db
    .select({ id: user.id, name: user.name, avatarKey: user.avatarKey })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, access.room.projectId));
}
