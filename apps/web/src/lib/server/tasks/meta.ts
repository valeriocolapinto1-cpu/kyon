import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { moveId, type Actor, type Priority } from '@kyon/core';
import type { Db } from '@/db/client';
import {
  activityEvent,
  kanbanColumn,
  projectMember,
  taskLabel,
  taskLabelLink,
  taskMeta,
  user,
} from '@/db/schema';
import { ApiError } from '../errors';
import { authorizeProject } from '../projects';
import { publishTasks } from '../realtime';
import { setDone } from './write';

export interface MetaPatch {
  assigneeId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  notes?: string | null;
  labelIds?: string[];
  /** Column + index inside it. Into or out of the done column also ticks/unticks in the repo. */
  move?: { columnId: string; index: number };
}

async function loadLive(db: Db, projectId: string, taskId: string) {
  const [meta] = await db.select().from(taskMeta).where(eq(taskMeta.id, taskId)).limit(1);
  if (!meta || meta.projectId !== projectId || meta.orphanedAt)
    throw new ApiError('not_found', 'Questa task non c’è più nella repo.');
  return meta;
}

/** Renumbers a column so that `taskId` sits at `index` (only the rows whose position changes). */
async function placeInColumn(
  db: Db,
  projectId: string,
  columnId: string,
  taskId: string,
  index: number,
) {
  const rows = await db
    .select({ id: taskMeta.id, position: taskMeta.position })
    .from(taskMeta)
    .where(
      and(
        eq(taskMeta.projectId, projectId),
        eq(taskMeta.columnId, columnId),
        isNull(taskMeta.orphanedAt),
      ),
    )
    .orderBy(taskMeta.position);
  const order = moveId(
    rows.map((r) => r.id),
    taskId,
    index,
  );
  const current = new Map(rows.map((r) => [r.id, r.position]));
  return order
    .map((id, position) => ({ id, position }))
    .filter(({ id, position }) => current.get(id) !== position || id === taskId)
    .map(({ id, position }) =>
      db
        .update(taskMeta)
        .set({ position, ...(id === taskId ? { columnId } : {}) })
        .where(eq(taskMeta.id, id)),
    );
}

/**
 * Kyon-only metadata (assignee, priority, due date, notes, labels, column). Only a move into or
 * out of "Fatto" touches the repo, through setDone (one-line commit, conflict retry).
 */
export async function updateTaskMeta(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  taskId: string,
  patch: MetaPatch,
) {
  await authorizeProject(db, actor, projectId, 'project:edit_tasks');
  let meta = await loadLive(db, projectId, taskId);
  const now = new Date();
  const set: Partial<typeof taskMeta.$inferInsert> = {};
  const events: { type: string; payload: Record<string, unknown> }[] = [];
  const statements = [];

  if (patch.assigneeId !== undefined && patch.assigneeId !== meta.assigneeId) {
    let name: string | null = null;
    if (patch.assigneeId) {
      const [member] = await db
        .select({ name: user.name })
        .from(projectMember)
        .innerJoin(user, eq(user.id, projectMember.userId))
        .where(
          and(eq(projectMember.projectId, projectId), eq(projectMember.userId, patch.assigneeId)),
        )
        .limit(1);
      if (!member)
        throw new ApiError('bad_request', 'Puoi assegnare solo a un membro del progetto.');
      name = member.name;
    }
    set.assigneeId = patch.assigneeId;
    events.push({ type: 'task_assigned', payload: { to: patch.assigneeId, toName: name } });
  }
  if (patch.priority !== undefined && patch.priority !== meta.priority) {
    set.priority = patch.priority;
    events.push({ type: 'task_priority', payload: { from: meta.priority, to: patch.priority } });
  }
  if (patch.dueDate !== undefined && patch.dueDate !== meta.dueDate) {
    set.dueDate = patch.dueDate;
    events.push({ type: 'task_due', payload: { from: meta.dueDate, to: patch.dueDate } });
  }
  if (patch.notes !== undefined && (patch.notes || null) !== meta.notes) {
    set.notes = patch.notes || null;
  }

  if (patch.labelIds !== undefined) {
    const ids = [...new Set(patch.labelIds)];
    if (ids.length) {
      const owned = await db
        .select({ id: taskLabel.id })
        .from(taskLabel)
        .where(and(eq(taskLabel.projectId, projectId), inArray(taskLabel.id, ids)));
      if (owned.length !== ids.length) throw new ApiError('bad_request', 'Etichetta sconosciuta.');
    }
    statements.push(db.delete(taskLabelLink).where(eq(taskLabelLink.taskId, taskId)));
    if (ids.length)
      statements.push(db.insert(taskLabelLink).values(ids.map((labelId) => ({ taskId, labelId }))));
  }

  let columnName: string | undefined;
  if (patch.move) {
    const [column] = await db
      .select()
      .from(kanbanColumn)
      .where(and(eq(kanbanColumn.id, patch.move.columnId), eq(kanbanColumn.projectId, projectId)))
      .limit(1);
    if (!column) throw new ApiError('bad_request', 'Colonna sconosciuta.');
    columnName = column.name;
    const fromColumn = meta.columnId;
    // The repo first: if the commit fails nothing else changes and the client rolls back.
    if (column.isDone !== meta.done) {
      await setDone(db, env, actor, projectId, taskId, column.isDone);
      meta = await loadLive(db, projectId, taskId);
    }
    statements.push(...(await placeInColumn(db, projectId, column.id, taskId, patch.move.index)));
    if (fromColumn !== column.id)
      events.push({
        type: 'task_moved',
        payload: { fromColumn, to: column.id, toName: column.name },
      });
  }

  if (Object.keys(set).length)
    statements.push(
      db
        .update(taskMeta)
        .set({ ...set, updatedAt: now })
        .where(eq(taskMeta.id, taskId)),
    );
  // Taken after the repo write so the move sorts after the tick it caused.
  const at = new Date();
  if (events.length)
    statements.push(
      db.insert(activityEvent).values(
        events.map((e) => ({
          id: crypto.randomUUID(),
          projectId,
          actorId: actor.id,
          taskId,
          type: e.type,
          payload: JSON.stringify({ taskId, text: meta.text, ...e.payload }),
          createdAt: at,
        })),
      ),
    );
  if (statements.length)
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

  await publishTasks(env, projectId, actor.id, [
    {
      id: taskId,
      text: meta.text,
      assigneeId: set.assigneeId !== undefined ? set.assigneeId : meta.assigneeId,
      column: columnName,
    },
  ]);
}

/** History shown in the task detail: newest first, with who did it. */
export async function taskHistory(db: Db, actor: Actor, projectId: string, taskId: string) {
  await authorizeProject(db, actor, projectId, 'project:view');
  const [meta] = await db
    .select({ id: taskMeta.id, projectId: taskMeta.projectId, createdAt: taskMeta.createdAt })
    .from(taskMeta)
    .where(eq(taskMeta.id, taskId))
    .limit(1);
  if (!meta || meta.projectId !== projectId) throw new ApiError('not_found');
  const rows = await db
    .select({
      id: activityEvent.id,
      type: activityEvent.type,
      payload: activityEvent.payload,
      createdAt: activityEvent.createdAt,
      actorId: activityEvent.actorId,
      actorName: user.name,
    })
    .from(activityEvent)
    .leftJoin(user, eq(user.id, activityEvent.actorId))
    .where(eq(activityEvent.taskId, taskId))
    .orderBy(desc(activityEvent.createdAt))
    .limit(50);
  return {
    createdAt: meta.createdAt.toISOString(),
    events: rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: JSON.parse(r.payload) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
      actor: r.actorId ? { id: r.actorId, name: r.actorName ?? '' } : null,
    })),
  };
}
