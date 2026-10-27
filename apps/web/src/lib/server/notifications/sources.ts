import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { addDays, projectRoom, today, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { project, projectMember, taskMeta, user } from '@/db/schema';
import { it } from '@/lib/i18n/it';
import type { RoomAccess } from '../chat/rooms';
import { liveRoomOf } from '../chat/rooms';
import { inChunks } from '../d1';
import { notify, type NotifyItem } from './notify';

const n = it.notify;

const excerpt = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
};

const taskUrl = (projectId: string, taskId: string) =>
  `/progetti?id=${encodeURIComponent(projectId)}&task=${encodeURIComponent(taskId)}`;

async function actorName(db: Db, actorId: string) {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, actorId));
  return row?.name ?? it.chat.someone;
}

/** Mentions (any room) and new messages (project chats, threads and task comments). */
export async function notifyChatMessage(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  access: RoomAccess,
  message: { body: string; mentions: string[]; hasAttachments: boolean },
) {
  const room = access.room;
  let where: string = n.groupChat;
  let url = `/chat?room=${encodeURIComponent(room.id)}`;
  if (access.project) where = access.project.name;
  if (room.kind === 'thread' && room.title) where = `${room.title} · ${where}`;
  if (room.kind === 'task' && room.taskId && room.projectId) {
    const [task] = await db
      .select({ text: taskMeta.text })
      .from(taskMeta)
      .where(eq(taskMeta.id, room.taskId));
    if (task) where = `«${excerpt(task.text).slice(0, 60)}»`;
    url = taskUrl(room.projectId, room.taskId);
  }
  const who = await actorName(db, actor.id);
  const body = `${who}: ${message.body ? excerpt(message.body) : n.attachment}`;
  const base = {
    url,
    projectId: room.projectId,
    chatRoomId: room.id,
    liveRoom: liveRoomOf(room),
  };
  const items: NotifyItem[] = message.mentions
    .filter((id) => id !== actor.id)
    .map((userId) => ({
      ...base,
      userId,
      event: 'mention' as const,
      title: n.mention(who, where),
      body,
    }));
  if (room.projectId) {
    const members = await db
      .select({ userId: projectMember.userId })
      .from(projectMember)
      .where(and(eq(projectMember.projectId, room.projectId), ne(projectMember.userId, actor.id)));
    for (const m of members) {
      if (message.mentions.includes(m.userId)) continue;
      items.push({
        ...base,
        userId: m.userId,
        event: 'message',
        title: n.message(where),
        groupTitle: (count) => n.messages(count, where),
        body,
        groupKey: `room:${room.id}`,
      });
    }
  }
  await notify(db, env, items);
}

/** "X ti ha assegnato una task" (never for assigning yourself). */
export async function notifyAssigned(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  task: { id: string; projectId: string; text: string },
  assigneeId: string | null,
) {
  if (!assigneeId || assigneeId === actor.id) return;
  const [proj] = await db
    .select({ name: project.name })
    .from(project)
    .where(eq(project.id, task.projectId));
  await notify(db, env, [
    {
      userId: assigneeId,
      event: 'assigned',
      title: n.assigned(await actorName(db, actor.id)),
      body: `${excerpt(task.text)} · ${proj?.name ?? ''}`,
      url: taskUrl(task.projectId, task.id),
      projectId: task.projectId,
      liveRoom: projectRoom(task.projectId),
    },
  ]);
}

/** PR linked, CI failed, merge: to whoever launched the run. */
export async function notifyRun(
  db: Db,
  env: CloudflareEnv,
  run: { id: string; projectId: string; taskText: string; launchedBy: string | null },
  kind: 'linked' | 'ci_failed' | 'merged',
  prNumber: number | null,
) {
  if (!run.launchedBy) return;
  const pr = prNumber ?? 0;
  const title =
    kind === 'linked'
      ? n.runLinked(pr)
      : kind === 'ci_failed'
        ? n.runCiFailed(pr)
        : n.runMerged(pr);
  await notify(db, env, [
    {
      userId: run.launchedBy,
      event: 'run',
      title,
      body: excerpt(run.taskText),
      url: `/progetti?id=${encodeURIComponent(run.projectId)}&tab=prompt`,
      projectId: run.projectId,
      // One per state: a redelivered webhook doesn't notify twice.
      groupKey: `run:${run.id}:${kind}:${pr}`,
      once: true,
    },
  ]);
}

/**
 * Due dates (from the cron): the day before and the same day, once each, for open tasks with
 * an assignee. Sent from 08:00 Rome time, so the reminder never lands at night.
 */
export async function notifyDueTasks(db: Db, env: CloudflareEnv, now = new Date()) {
  const day = today('Europe/Rome', now);
  const tomorrow = addDays(day, 1);
  const rows = await db
    .select({
      id: taskMeta.id,
      projectId: taskMeta.projectId,
      text: taskMeta.text,
      dueDate: taskMeta.dueDate,
      assigneeId: taskMeta.assigneeId,
      projectName: project.name,
    })
    .from(taskMeta)
    .innerJoin(project, eq(project.id, taskMeta.projectId))
    .where(
      and(
        inArray(taskMeta.dueDate, [day, tomorrow]),
        eq(taskMeta.done, false),
        isNull(taskMeta.orphanedAt),
        isNull(project.archivedAt),
      ),
    )
    .limit(200);
  // The assignee must still be in the project (they may have left it).
  const members = await inChunks([...new Set(rows.map((r) => r.projectId))], (ids) =>
    db
      .select({ projectId: projectMember.projectId, userId: projectMember.userId })
      .from(projectMember)
      .where(inArray(projectMember.projectId, ids)),
  );
  const items: NotifyItem[] = rows
    .filter(
      (r) =>
        r.assigneeId &&
        members.some((m) => m.projectId === r.projectId && m.userId === r.assigneeId),
    )
    .map((r) => ({
      userId: r.assigneeId as string,
      event: 'due' as const,
      title: r.dueDate === day ? n.dueToday : n.dueTomorrow,
      body: `${excerpt(r.text)} · ${r.projectName}`,
      url: taskUrl(r.projectId, r.id),
      projectId: r.projectId,
      groupKey: `due:${r.id}:${r.dueDate}:${r.dueDate === day ? 'today' : 'tomorrow'}`,
      once: true,
    }));
  await notify(db, env, items);
  return items.length;
}
