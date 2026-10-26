import { and, eq } from 'drizzle-orm';
import {
  addTask,
  parseTasks,
  relocate,
  renameTask,
  setTaskDone,
  TaskMovedError,
  tasksTemplate,
  type Actor,
  type ParsedFile,
} from '@kyon/core';
import type { Db } from '@/db/client';
import { activityEvent, project, taskFile, taskMeta } from '@/db/schema';
import { ApiError } from '../errors';
import { GitHubError } from '../github/client';
import {
  WriteConflictError,
  ensureBranch,
  ensurePullRequest,
  getFile,
  putFile,
} from '../github/files';
import { authorizeProject } from '../projects';
import { KYON_TASKS_BRANCH, parsePlanKeywords, readBranch, repoAccess } from './access';
import { applyParsedFile } from './apply';

type Mutation = { content: string; message: string } | null;

function trailer(coAuthor: { name: string; email: string } | null) {
  return coAuthor ? `\n\nCo-authored-by: ${coAuthor.name} <${coAuthor.email}>` : '';
}

const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

/**
 * Read → change one line → write with the file's sha. On a 409 (someone pushed meanwhile) the
 * file is read again and the change re-applied once; then a clear error, nothing lost.
 */
async function editFile(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  path: string,
  mutate: (content: string, parsed: ParsedFile) => Mutation,
) {
  const { project: row } = await authorizeProject(db, actor, projectId, 'project:edit_tasks');
  const access = await repoAccess(db, env, row, actor.id);
  const keywords = parsePlanKeywords(row);
  let branch = readBranch(row, access.defaultBranch);
  if (row.commitMode === 'branch_pr')
    await ensureBranch(
      access.config,
      access.token,
      access.ref,
      KYON_TASKS_BRANCH,
      row.workBranch || access.defaultBranch,
    );

  for (let attempt = 0; attempt < 2; attempt++) {
    let file: { sha: string | null; content: string };
    try {
      file = await getFile(access.config, access.token, access.ref, path, branch);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) file = { sha: null, content: '' };
      else throw error;
    }
    const change = mutate(file.content, parseTasks(path, file.content, { planKeywords: keywords }));
    if (!change) return { committed: false };
    try {
      const written = await putFile(access.config, access.token, access.ref, path, {
        content: change.content,
        sha: file.sha,
        branch,
        message: `${change.message}${trailer(access.coAuthor)}`,
      });
      await applyParsedFile(
        db,
        projectId,
        parseTasks(path, change.content, { planKeywords: keywords }),
        written.blobSha,
        'tasks',
        actor.id,
      );
      if (row.commitMode === 'branch_pr') {
        await ensurePullRequest(
          access.config,
          access.token,
          access.ref,
          KYON_TASKS_BRANCH,
          row.workBranch || access.defaultBranch,
          'Aggiornamento task da Kyon',
          'Le modifiche alle task fatte da Kyon. Unisci quando vuoi.',
        );
      }
      return { committed: true, commitSha: written.commitSha };
    } catch (error) {
      if (!(error instanceof WriteConflictError) || attempt === 1) {
        if (error instanceof WriteConflictError)
          throw new ApiError(
            'conflict',
            'Il file è cambiato su GitHub mentre salvavi. Ricarica e riprova.',
          );
        throw error;
      }
      // fall through: read again and re-apply on the fresh version
      branch = readBranch(row, access.defaultBranch);
    }
  }
  return { committed: false };
}

async function loadMeta(db: Db, projectId: string, taskId: string) {
  const [meta] = await db.select().from(taskMeta).where(eq(taskMeta.id, taskId)).limit(1);
  if (!meta || meta.projectId !== projectId || meta.orphanedAt)
    throw new ApiError('not_found', 'Questa task non c’è più nella repo.');
  return meta;
}

function locate(meta: typeof taskMeta.$inferSelect, parsed: ParsedFile) {
  const task = relocate(
    {
      stableId: meta.stableId,
      path: meta.path,
      headingPath: JSON.parse(meta.headingPath) as string[],
      text: meta.text,
    },
    parsed.tasks,
  );
  if (!task) throw new ApiError('not_found', 'Questa task non c’è più nella repo.');
  return task;
}

export async function logEvent(
  db: Db,
  projectId: string,
  actorId: string,
  type: string,
  payload: Record<string, unknown> & { taskId?: string },
) {
  await db.insert(activityEvent).values({
    id: crypto.randomUUID(),
    projectId,
    actorId,
    taskId: payload.taskId ?? null,
    type,
    payload: JSON.stringify(payload),
    createdAt: new Date(),
  });
}

export async function setDone(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  taskId: string,
  done: boolean,
) {
  const meta = await loadMeta(db, projectId, taskId);
  return editFile(db, env, actor, projectId, meta.path, (content, parsed) => {
    const task = locate(meta, parsed);
    if (task.done === done) return null;
    try {
      return {
        content: setTaskDone(content, task, done),
        message: `chore(tasks): ${done ? 'complete' : 'reopen'} "${short(task.text)}" via Kyon`,
      };
    } catch (error) {
      if (error instanceof TaskMovedError) throw new ApiError('conflict');
      throw error;
    }
  });
}

export async function rename(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  taskId: string,
  text: string,
) {
  const meta = await loadMeta(db, projectId, taskId);
  const result = await editFile(db, env, actor, projectId, meta.path, (content, parsed) => {
    const task = locate(meta, parsed);
    if (task.text === text) return null;
    return {
      content: renameTask(content, task, text),
      message: `chore(tasks): rename "${short(task.text)}" via Kyon`,
    };
  });
  await logEvent(db, projectId, actor.id, 'task_renamed', { taskId, from: meta.text, to: text });
  return result;
}

export async function add(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  path: string,
  headingPath: string[] | null,
  text: string,
) {
  const [existing] = await db
    .select()
    .from(taskFile)
    .where(and(eq(taskFile.projectId, projectId), eq(taskFile.path, path)))
    .limit(1);
  if (!existing) throw new ApiError('bad_request', 'Scegli un file .md del progetto.');
  const result = await editFile(db, env, actor, projectId, path, (content) => ({
    content: addTask(content, headingPath, text).content,
    message: `chore(tasks): add "${short(text)}" via Kyon`,
  }));
  await logEvent(db, projectId, actor.id, 'task_added', { text, path });
  return result;
}

/** "Crea TASKS.md": only when the project has no tasks yet. */
export async function createTasksFile(db: Db, env: CloudflareEnv, actor: Actor, projectId: string) {
  const [row] = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
  const [anyTask] = await db
    .select({ id: taskMeta.id })
    .from(taskMeta)
    .where(eq(taskMeta.projectId, projectId))
    .limit(1);
  if (anyTask) throw new ApiError('conflict', 'Il progetto ha già delle task.');
  return editFile(db, env, actor, projectId, 'TASKS.md', (content) =>
    content
      ? null
      : { content: tasksTemplate(row?.name ?? 'progetto'), message: 'docs: add TASKS.md for Kyon' },
  );
}
