import { and, eq, max } from 'drizzle-orm';
import { MAX_COLUMNS, MAX_LABELS, moveId, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { kanbanColumn, taskLabel, taskMeta } from '@/db/schema';
import { ApiError } from '../errors';
import { authorizeProject } from '../projects';
import { publish } from '../realtime';
import { projectColumns } from './apply';

const changed = (env: CloudflareEnv, projectId: string, actorId: string) =>
  publish(env, `project:${projectId}`, { type: 'tasks_changed', actorId });

/** Columns are part of the project's setup: owners only. */
export async function createColumn(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  name: string,
) {
  await authorizeProject(db, actor, projectId, 'project:settings');
  const { columns, done } = await projectColumns(db, projectId);
  if (columns.length >= MAX_COLUMNS)
    throw new ApiError('bad_request', `Puoi avere al massimo ${MAX_COLUMNS} colonne.`);
  if (columns.some((c) => c.name.toLowerCase() === name.toLowerCase()))
    throw new ApiError('conflict', 'Esiste già una colonna con questo nome.');
  // New columns go just before "Fatto", where work usually happens.
  const id = crypto.randomUUID();
  const order = moveId(
    columns.map((c) => c.id),
    id,
    done ? columns.indexOf(done) : columns.length,
  );
  await db.batch([
    db.insert(kanbanColumn).values({ id, projectId, name, position: order.indexOf(id) }),
    ...order
      .filter((x) => x !== id)
      .map((x) =>
        db
          .update(kanbanColumn)
          .set({ position: order.indexOf(x) })
          .where(eq(kanbanColumn.id, x)),
      ),
  ]);
  await changed(env, projectId, actor.id);
  return { id };
}

export async function updateColumn(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  columnId: string,
  patch: { name?: string; index?: number },
) {
  await authorizeProject(db, actor, projectId, 'project:settings');
  const { columns } = await projectColumns(db, projectId);
  const column = columns.find((c) => c.id === columnId);
  if (!column) throw new ApiError('not_found');
  const statements = [];
  if (patch.name !== undefined && patch.name !== column.name) {
    if (
      columns.some((c) => c.id !== columnId && c.name.toLowerCase() === patch.name?.toLowerCase())
    )
      throw new ApiError('conflict', 'Esiste già una colonna con questo nome.');
    statements.push(
      db.update(kanbanColumn).set({ name: patch.name }).where(eq(kanbanColumn.id, columnId)),
    );
  }
  if (patch.index !== undefined) {
    const order = moveId(
      columns.map((c) => c.id),
      columnId,
      patch.index,
    );
    for (const [position, id] of order.entries())
      if (columns.find((c) => c.id === id)?.position !== position)
        statements.push(db.update(kanbanColumn).set({ position }).where(eq(kanbanColumn.id, id)));
  }
  if (statements.length)
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  await changed(env, projectId, actor.id);
}

/**
 * "Fatto" and "In corso" drive repo writes and automatic moves: they can be renamed, not deleted.
 * Tasks of a deleted column go to the first remaining "to do" column.
 */
export async function deleteColumn(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  columnId: string,
) {
  await authorizeProject(db, actor, projectId, 'project:settings');
  const { columns } = await projectColumns(db, projectId);
  const column = columns.find((c) => c.id === columnId);
  if (!column) throw new ApiError('not_found');
  if (column.isDone || column.isInProgress)
    throw new ApiError(
      'bad_request',
      'Questa colonna serve a Kyon: puoi rinominarla ma non eliminarla.',
    );
  const target = columns.find((c) => c.id !== columnId && !c.isDone && !c.isInProgress);
  if (!target) throw new ApiError('bad_request', 'Serve almeno una colonna per le task da fare.');
  const [top] = await db
    .select({ value: max(taskMeta.position) })
    .from(taskMeta)
    .where(and(eq(taskMeta.projectId, projectId), eq(taskMeta.columnId, target.id)));
  const base = (top?.value ?? 0) + 1;
  const moving = await db
    .select({ id: taskMeta.id })
    .from(taskMeta)
    .where(eq(taskMeta.columnId, columnId))
    .orderBy(taskMeta.position);
  // The delete goes first in the batch only for typing; it runs in one transaction anyway and
  // the tasks' column_id is "set null" on delete, then set again by the updates.
  await db.batch([
    db.delete(kanbanColumn).where(eq(kanbanColumn.id, columnId)),
    ...moving.map((t, i) =>
      db
        .update(taskMeta)
        .set({ columnId: target.id, position: base + i })
        .where(eq(taskMeta.id, t.id)),
    ),
  ]);
  await changed(env, projectId, actor.id);
}

export async function createLabel(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  input: { name: string; color: string },
) {
  await authorizeProject(db, actor, projectId, 'project:edit_tasks');
  const labels = await db.select().from(taskLabel).where(eq(taskLabel.projectId, projectId));
  if (labels.length >= MAX_LABELS)
    throw new ApiError('bad_request', `Puoi avere al massimo ${MAX_LABELS} etichette.`);
  const existing = labels.find((l) => l.name.toLowerCase() === input.name.toLowerCase());
  if (existing) return { id: existing.id };
  const id = crypto.randomUUID();
  await db.insert(taskLabel).values({ id, projectId, ...input });
  await changed(env, projectId, actor.id);
  return { id };
}

export async function updateLabel(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  labelId: string,
  patch: { name?: string; color?: string },
) {
  await authorizeProject(db, actor, projectId, 'project:edit_tasks');
  const result = await db
    .update(taskLabel)
    .set(patch)
    .where(and(eq(taskLabel.id, labelId), eq(taskLabel.projectId, projectId)))
    .returning({ id: taskLabel.id });
  if (!result.length) throw new ApiError('not_found');
  await changed(env, projectId, actor.id);
}

export async function deleteLabel(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  labelId: string,
) {
  await authorizeProject(db, actor, projectId, 'project:edit_tasks');
  await db
    .delete(taskLabel)
    .where(and(eq(taskLabel.id, labelId), eq(taskLabel.projectId, projectId)));
  await changed(env, projectId, actor.id);
}
