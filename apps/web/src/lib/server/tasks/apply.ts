import { and, eq, gt, inArray, isNotNull, isNull, lt, max, or } from 'drizzle-orm';
import {
  ORPHANED_TASK_RETENTION_MS,
  reconcile,
  type ParsedFile,
  type ParsedTask,
} from '@kyon/core';
import type { Db } from '@/db/client';
import { activityEvent, kanbanColumn, taskFile, taskMeta } from '@/db/schema';

export async function projectColumns(db: Db, projectId: string) {
  const columns = await db
    .select()
    .from(kanbanColumn)
    .where(eq(kanbanColumn.projectId, projectId))
    .orderBy(kanbanColumn.position);
  const done = columns.find((c) => c.isDone) ?? null;
  const todo =
    columns.find((c) => !c.isDone && !c.isInProgress) ?? columns.find((c) => !c.isDone) ?? null;
  return { columns, done, todo };
}

export const DEFAULT_COLUMNS = [
  { name: 'Da fare', isDone: false, isInProgress: false },
  { name: 'In corso', isDone: false, isInProgress: true },
  { name: 'Fatto', isDone: true, isInProgress: false },
];

/** Keeps only what the UI needs from a parse (JSON stored in task_file). */
function slim(file: ParsedFile) {
  return {
    tasks: file.tasks.map((t: ParsedTask) => ({
      stableId: t.stableId,
      headingPath: t.headingPath,
      text: t.text,
      done: t.done,
      style: t.style,
      line: t.line,
      parentId: t.parentId,
      notes: t.notes,
    })),
    tables: file.tables,
  };
}

export type StoredTask = ReturnType<typeof slim>['tasks'][number];

/**
 * Stores the parse of one file and reconciles its tasks with Kyon's metadata: new tasks get a
 * row (in "Fatto" if already done), edited ones keep their row, vanished ones become orphans.
 * Done changes move the card between "Fatto" and "Da fare" and are recorded in the activity log.
 */
export async function applyParsedFile(
  db: Db,
  projectId: string,
  file: ParsedFile,
  blobSha: string,
  kind: 'tasks' | 'archive',
  actorId: string | null,
  now = new Date(),
) {
  await db
    .insert(taskFile)
    .values({
      projectId,
      path: file.path,
      blobSha,
      kind,
      parsed: JSON.stringify(slim(file)),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [taskFile.projectId, taskFile.path],
      set: { blobSha, kind, parsed: JSON.stringify(slim(file)), updatedAt: now },
    });

  // Recently orphaned rows can come back (e.g. a task cut and pasted in two commits).
  const revivable = new Date(now.getTime() - ORPHANED_TASK_RETENTION_MS);
  const known = await db
    .select()
    .from(taskMeta)
    .where(
      and(
        eq(taskMeta.projectId, projectId),
        eq(taskMeta.path, file.path),
        or(isNull(taskMeta.orphanedAt), gt(taskMeta.orphanedAt, revivable)),
      ),
    );
  const result = reconcile(
    known.map((k) => ({
      id: k.id,
      stableId: k.stableId,
      path: k.path,
      headingPath: JSON.parse(k.headingPath) as string[],
      text: k.text,
    })),
    file.tasks,
  );
  const { done: doneCol, todo: todoCol } = await projectColumns(db, projectId);
  const byId = new Map(known.map((k) => [k.id, k]));
  const statements = [];
  const events: (typeof activityEvent.$inferInsert)[] = [];

  for (const { id, task } of result.matched) {
    const prev = byId.get(id);
    if (!prev) continue;
    const values: Partial<typeof taskMeta.$inferInsert> = {
      stableId: task.stableId,
      text: task.text,
      headingPath: JSON.stringify(task.headingPath),
      done: task.done,
      orphanedAt: null,
      updatedAt: now,
    };
    if (prev.done !== task.done) {
      if (task.done && doneCol) values.columnId = doneCol.id;
      if (!task.done && prev.columnId === doneCol?.id && todoCol) values.columnId = todoCol.id;
      events.push({
        id: crypto.randomUUID(),
        projectId,
        actorId,
        taskId: id,
        type: task.done ? 'task_completed' : 'task_reopened',
        payload: JSON.stringify({
          taskId: id,
          text: task.text,
          path: file.path,
          source: actorId ? 'kyon' : 'github',
        }),
        createdAt: now,
      });
    }
    statements.push(db.update(taskMeta).set(values).where(eq(taskMeta.id, id)));
  }

  if (result.created.length) {
    const [top] = await db
      .select({ value: max(taskMeta.position) })
      .from(taskMeta)
      .where(eq(taskMeta.projectId, projectId));
    let position = (top?.value ?? 0) + 1;
    for (const task of result.created) {
      statements.push(
        db.insert(taskMeta).values({
          id: crypto.randomUUID(),
          projectId,
          stableId: task.stableId,
          path: file.path,
          headingPath: JSON.stringify(task.headingPath),
          text: task.text,
          done: task.done,
          columnId: (task.done ? doneCol : todoCol)?.id ?? null,
          position: position++,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }

  if (result.orphaned.length) {
    statements.push(
      db
        .update(taskMeta)
        .set({ orphanedAt: now, updatedAt: now })
        .where(inArray(taskMeta.id, result.orphaned)),
    );
  }
  if (events.length) statements.push(db.insert(activityEvent).values(events));
  if (statements.length)
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  return {
    created: result.created.length,
    orphaned: result.orphaned.length,
    changed: events.length,
  };
}

/** A file disappeared from the repo: forget its snapshot and orphan its tasks. */
export async function removeFile(db: Db, projectId: string, path: string, now = new Date()) {
  await db.batch([
    db.delete(taskFile).where(and(eq(taskFile.projectId, projectId), eq(taskFile.path, path))),
    db
      .update(taskMeta)
      .set({ orphanedAt: now, updatedAt: now })
      .where(
        and(
          eq(taskMeta.projectId, projectId),
          eq(taskMeta.path, path),
          isNull(taskMeta.orphanedAt),
        ),
      ),
  ]);
}

/** Orphans older than 30 days are deleted (cron). */
export async function purgeOrphans(db: Db, now = new Date()) {
  await db
    .delete(taskMeta)
    .where(
      and(
        isNotNull(taskMeta.orphanedAt),
        lt(taskMeta.orphanedAt, new Date(now.getTime() - ORPHANED_TASK_RETENTION_MS)),
      ),
    );
}
