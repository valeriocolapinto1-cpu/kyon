import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import {
  chatMessage,
  chatRoom,
  projectSync,
  taskFile,
  taskLabel,
  taskLabelLink,
  taskMeta,
  user,
} from '@/db/schema';
import { authorizeProject } from '../projects';
import { avatarUrl } from '../users';
import { latestRunsByTask } from '../prompts/runs';
import { projectColumns, type StoredTask } from './apply';

export interface TaskView extends StoredTask {
  id: string;
  path: string;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  priority: string;
  dueDate: string | null;
  columnId: string | null;
  position: number;
  labels: { id: string; name: string; color: string }[];
  notesKyon: string | null;
  /** Latest prompt run of the task (state shown on the card). */
  run: { id: string; state: string; prNumber: number | null; prUrl: string | null } | null;
  comments: number;
}

/** Everything the Task tab needs, in one request: files (with tables), tasks + metadata, columns. */
export async function listProjectTasks(db: Db, actor: Actor, projectId: string) {
  await authorizeProject(db, actor, projectId, 'project:view');
  const [files, metas, { columns }, labels, [sync], runs, comments] = await Promise.all([
    db.select().from(taskFile).where(eq(taskFile.projectId, projectId)).orderBy(taskFile.path),
    db
      .select({ meta: taskMeta, assigneeName: user.name, assigneeAvatar: user.avatarKey })
      .from(taskMeta)
      .leftJoin(user, eq(user.id, taskMeta.assigneeId))
      .where(and(eq(taskMeta.projectId, projectId), isNull(taskMeta.orphanedAt))),
    projectColumns(db, projectId),
    db.select().from(taskLabel).where(eq(taskLabel.projectId, projectId)),
    db.select().from(projectSync).where(eq(projectSync.projectId, projectId)).limit(1),
    latestRunsByTask(db, projectId),
    db
      .select({ taskId: chatRoom.taskId, n: sql<number>`count(${chatMessage.id})` })
      .from(chatRoom)
      .innerJoin(
        chatMessage,
        and(eq(chatMessage.roomId, chatRoom.id), isNull(chatMessage.deletedAt)),
      )
      .where(and(eq(chatRoom.projectId, projectId), eq(chatRoom.kind, 'task')))
      .groupBy(chatRoom.taskId),
  ]);
  const commentsByTask = new Map(comments.map((c) => [c.taskId, Number(c.n)]));
  // Joined on the project (not an IN list): D1 caps bound parameters at 100.
  const links = metas.length
    ? await db
        .select({ taskId: taskLabelLink.taskId, labelId: taskLabelLink.labelId })
        .from(taskLabelLink)
        .innerJoin(taskMeta, eq(taskMeta.id, taskLabelLink.taskId))
        .where(eq(taskMeta.projectId, projectId))
    : [];
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const labelsByTask = new Map<string, { id: string; name: string; color: string }[]>();
  for (const link of links) {
    const label = labelById.get(link.labelId);
    if (label)
      labelsByTask.set(link.taskId, [
        ...(labelsByTask.get(link.taskId) ?? []),
        { id: label.id, name: label.name, color: label.color },
      ]);
  }
  const metaByStable = new Map(metas.map((m) => [`${m.meta.path}\n${m.meta.stableId}`, m]));

  const viewFiles = files.map((f) => {
    const parsed = JSON.parse(f.parsed) as {
      tasks: StoredTask[];
      tables: { headingPath: string[]; line: number; markdown: string }[];
    };
    const tasks: TaskView[] = [];
    for (const t of parsed.tasks) {
      const m = metaByStable.get(`${f.path}\n${t.stableId}`);
      if (!m) continue;
      tasks.push({
        ...t,
        id: m.meta.id,
        path: f.path,
        assignee: m.meta.assigneeId
          ? {
              id: m.meta.assigneeId,
              name: m.assigneeName ?? '',
              avatarUrl: avatarUrl(m.meta.assigneeId, m.assigneeAvatar),
            }
          : null,
        priority: m.meta.priority,
        dueDate: m.meta.dueDate,
        columnId: m.meta.columnId,
        position: m.meta.position,
        labels: labelsByTask.get(m.meta.id) ?? [],
        notesKyon: m.meta.notes,
        run: runs.get(m.meta.id) ?? null,
        comments: commentsByTask.get(m.meta.id) ?? 0,
      });
    }
    return { path: f.path, kind: f.kind as 'tasks' | 'archive', tables: parsed.tables, tasks };
  });

  const orphaned = await db
    .select({
      id: taskMeta.id,
      text: taskMeta.text,
      path: taskMeta.path,
      orphanedAt: taskMeta.orphanedAt,
    })
    .from(taskMeta)
    .where(and(eq(taskMeta.projectId, projectId), isNotNull(taskMeta.orphanedAt)));

  return {
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      isDone: c.isDone,
      isInProgress: c.isInProgress,
    })),
    labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    // A file without tasks doesn't appear in the task views (its tables alone aren't tasks).
    files: viewFiles.filter((f) => f.tasks.length > 0),
    orphaned: orphaned.map((o) => ({ ...o, orphanedAt: o.orphanedAt?.toISOString() ?? null })),
    sync: {
      lastSyncAt: sync?.lastSyncAt?.toISOString() ?? null,
      lastError: sync?.lastError ?? null,
      pending: sync?.pending ? (JSON.parse(sync.pending) as string[]).length : 0,
      everSynced: Boolean(sync?.lastSyncAt),
    },
  };
}
