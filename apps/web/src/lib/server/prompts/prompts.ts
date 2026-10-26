import { and, count, desc, eq, max } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { prompt, promptRun, promptVersion, taskMeta, user } from '@/db/schema';
import { ApiError } from '../errors';
import { authorizeProject } from '../projects';
import { publish } from '../realtime';

export type PromptStatus = 'draft' | 'ready' | 'used';

/** Loads a prompt and checks the actor's permission on its project. */
export async function authorizePrompt(
  db: Db,
  actor: Actor,
  promptId: string,
  action: 'project:view' | 'project:write_prompt' | 'project:run_prompt',
) {
  const [row] = await db.select().from(prompt).where(eq(prompt.id, promptId)).limit(1);
  if (!row) throw new ApiError('not_found');
  const access = await authorizeProject(db, actor, row.projectId, action);
  return { prompt: row, ...access };
}

const changed = (env: CloudflareEnv, projectId: string, actorId: string) =>
  publish(env, `project:${projectId}`, { type: 'runs_changed', actorId });

/** Every prompt and run of a project, for the Prompt tab and the task detail. */
export async function listProjectPrompts(db: Db, actor: Actor, projectId: string) {
  await authorizeProject(db, actor, projectId, 'project:view');
  const pinned = alias(promptVersion, 'pinned');
  const [prompts, counts, runs] = await Promise.all([
    db
      .select({
        prompt,
        body: promptVersion.body,
        number: promptVersion.number,
        taskText: taskMeta.text,
        taskOrphaned: taskMeta.orphanedAt,
        authorName: user.name,
      })
      .from(prompt)
      .leftJoin(promptVersion, eq(promptVersion.id, prompt.currentVersionId))
      .leftJoin(taskMeta, eq(taskMeta.id, prompt.taskId))
      .leftJoin(user, eq(user.id, prompt.createdBy))
      .where(eq(prompt.projectId, projectId))
      .orderBy(desc(prompt.updatedAt)),
    db
      .select({ promptId: promptVersion.promptId, n: count() })
      .from(promptVersion)
      .innerJoin(prompt, eq(prompt.id, promptVersion.promptId))
      .where(eq(prompt.projectId, projectId))
      .groupBy(promptVersion.promptId),
    db
      .select({ run: promptRun, launcherName: user.name, version: pinned.number })
      .from(promptRun)
      .leftJoin(user, eq(user.id, promptRun.launchedBy))
      .leftJoin(pinned, eq(pinned.id, promptRun.promptVersionId))
      .where(eq(promptRun.projectId, projectId))
      .orderBy(desc(promptRun.copiedAt))
      .limit(200),
  ]);
  const countByPrompt = new Map(counts.map((c) => [c.promptId, c.n]));
  return {
    prompts: prompts.map(({ prompt: p, body, number, taskText, taskOrphaned, authorName }) => ({
      id: p.id,
      taskId: p.taskId,
      taskText: taskText ?? null,
      taskGone: !p.taskId || Boolean(taskOrphaned),
      title: p.title,
      status: p.status as PromptStatus,
      body: body ?? '',
      version: number ?? 0,
      versionCount: countByPrompt.get(p.id) ?? 0,
      createdBy: p.createdBy ? { id: p.createdBy, name: authorName ?? '' } : null,
      updatedAt: p.updatedAt.toISOString(),
    })),
    runs: runs.map(({ run, launcherName, version }) => runView(run, launcherName, version)),
  };
}

export function runView(
  run: typeof promptRun.$inferSelect,
  launcherName: string | null,
  version: number | null = null,
) {
  return {
    id: run.id,
    promptId: run.promptId,
    taskId: run.taskId,
    taskText: run.taskText,
    state: run.state,
    branch: run.branch,
    prNumber: run.prNumber,
    prUrl: run.prUrl,
    prTitle: run.prTitle,
    linkSource: run.linkSource,
    launchedBy: run.launchedBy ? { id: run.launchedBy, name: launcherName ?? '' } : null,
    copiedAt: run.copiedAt.toISOString(),
    mergedAt: run.mergedAt?.toISOString() ?? null,
    resultNotes: run.resultNotes,
    taskClosedByRun: run.taskClosedByRun,
    promptVersion: version,
  };
}

async function addVersion(db: Db, promptId: string, body: string, authorId: string) {
  const [top] = await db
    .select({ value: max(promptVersion.number) })
    .from(promptVersion)
    .where(eq(promptVersion.promptId, promptId));
  const id = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(promptVersion).values({
      id,
      promptId,
      number: (top?.value ?? 0) + 1,
      body,
      authorId,
      createdAt: now,
    }),
    db.update(prompt).set({ currentVersionId: id, updatedAt: now }).where(eq(prompt.id, promptId)),
  ]);
  return id;
}

export async function createPrompt(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  input: { taskId: string; title: string; body: string },
) {
  await authorizeProject(db, actor, projectId, 'project:write_prompt');
  const [task] = await db
    .select({ id: taskMeta.id })
    .from(taskMeta)
    .where(and(eq(taskMeta.id, input.taskId), eq(taskMeta.projectId, projectId)))
    .limit(1);
  if (!task) throw new ApiError('bad_request', 'Scegli una task del progetto.');
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(prompt).values({
    id,
    projectId,
    taskId: input.taskId,
    title: input.title,
    status: 'draft',
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  });
  await addVersion(db, id, input.body, actor.id);
  await changed(env, projectId, actor.id);
  return { id };
}

/** Title and status change in place; a different body becomes a new version. */
export async function updatePrompt(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  promptId: string,
  patch: { title?: string; status?: PromptStatus; body?: string },
) {
  const { prompt: row } = await authorizePrompt(db, actor, promptId, 'project:write_prompt');
  const set: Partial<typeof prompt.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.status !== undefined) set.status = patch.status;
  if (Object.keys(set).length)
    await db
      .update(prompt)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(prompt.id, promptId));
  if (patch.body !== undefined) {
    const [current] = row.currentVersionId
      ? await db
          .select({ body: promptVersion.body })
          .from(promptVersion)
          .where(eq(promptVersion.id, row.currentVersionId))
      : [];
    if (current?.body !== patch.body) await addVersion(db, promptId, patch.body, actor.id);
  }
  await changed(env, row.projectId, actor.id);
}

export async function listVersions(db: Db, actor: Actor, promptId: string) {
  await authorizePrompt(db, actor, promptId, 'project:view');
  const rows = await db
    .select({ version: promptVersion, authorName: user.name })
    .from(promptVersion)
    .leftJoin(user, eq(user.id, promptVersion.authorId))
    .where(eq(promptVersion.promptId, promptId))
    .orderBy(desc(promptVersion.number));
  return rows.map(({ version, authorName }) => ({
    id: version.id,
    number: version.number,
    body: version.body,
    author: version.authorId ? { id: version.authorId, name: authorName ?? '' } : null,
    createdAt: version.createdAt.toISOString(),
  }));
}

/** Restoring never rewrites history: the old text becomes the newest version. */
export async function restoreVersion(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  promptId: string,
  versionId: string,
) {
  const { prompt: row } = await authorizePrompt(db, actor, promptId, 'project:write_prompt');
  const [version] = await db
    .select()
    .from(promptVersion)
    .where(and(eq(promptVersion.id, versionId), eq(promptVersion.promptId, promptId)))
    .limit(1);
  if (!version) throw new ApiError('not_found');
  await addVersion(db, promptId, version.body, actor.id);
  await changed(env, row.projectId, actor.id);
}

/** Runs keep their copied text (prompt_id is set to null). */
export async function deletePrompt(db: Db, env: CloudflareEnv, actor: Actor, promptId: string) {
  const { prompt: row } = await authorizePrompt(db, actor, promptId, 'project:write_prompt');
  await db.delete(prompt).where(eq(prompt.id, promptId));
  await changed(env, row.projectId, actor.id);
}
