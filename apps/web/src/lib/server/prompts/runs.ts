import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  ACTIVE_RUN_STATES,
  buildFullPrompt,
  can,
  generateRunId,
  parseMarkers,
  projectRoom,
  runStateFrom,
  subtaskList,
  suggestPull,
  suggestedBranch,
  type Actor,
  type ProjectRole,
  type RunState,
} from '@kyon/core';
import type { Db } from '@/db/client';
import {
  activityEvent,
  githubConnection,
  githubRepo,
  kanbanColumn,
  project,
  projectMember,
  prompt,
  promptRun,
  promptVersion,
  taskFile,
  taskMeta,
  user,
} from '@/db/schema';
import { ApiError } from '../errors';
import { notifyRun } from '../notifications/sources';
import { GitHubError } from '../github/client';
import {
  checkRuns,
  getPull,
  isMerged,
  listPulls,
  pullCommitMessages,
  toCandidate,
  type GhPull,
} from '../github/pulls';
import { authorizeProject, projectResource } from '../projects';
import { publish } from '../realtime';
import { repoAccess, type RepoAccess } from '../tasks/access';
import type { StoredTask } from '../tasks/apply';
import { updateTaskMeta } from '../tasks/meta';
import { setDone } from '../tasks/write';
import { authorizePrompt, runView } from './prompts';
import { promptFooter } from './templates';

type RunRow = typeof promptRun.$inferSelect;
type ProjectRow = typeof project.$inferSelect;
type LinkSource = 'marker' | 'suggested' | 'manual';

const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .trim();

async function notifyRunSafely(
  db: Db,
  env: CloudflareEnv,
  run: RunRow,
  kind: 'linked' | 'ci_failed' | 'merged',
  pr: number | null,
) {
  try {
    await notifyRun(db, env, run, kind, pr);
  } catch (error) {
    console.warn('Run notification failed', error);
  }
}

async function logRunEvent(
  db: Db,
  run: Pick<RunRow, 'id' | 'projectId' | 'taskId' | 'taskText'>,
  actorId: string | null,
  type: string,
  extra: Record<string, unknown> = {},
) {
  await db.insert(activityEvent).values({
    id: crypto.randomUUID(),
    projectId: run.projectId,
    actorId,
    taskId: run.taskId,
    type,
    payload: JSON.stringify({ runId: run.id, taskId: run.taskId, text: run.taskText, ...extra }),
    createdAt: new Date(),
  });
}

const runsChanged = (
  env: CloudflareEnv,
  projectId: string,
  actorId: string | null,
  closed?: { runId: string; taskText: string; launchedBy: string | null },
) => publish(env, projectRoom(projectId), { type: 'runs_changed', actorId, closed });

async function loadRun(db: Db, runId: string) {
  const [run] = await db.select().from(promptRun).where(eq(promptRun.id, runId)).limit(1);
  if (!run) throw new ApiError('not_found');
  return run;
}

async function authorizeRun(
  db: Db,
  actor: Actor,
  runId: string,
  action: 'project:view' | 'project:run_prompt',
) {
  const run = await loadRun(db, runId);
  const access = await authorizeProject(db, actor, run.projectId, action);
  return { run, project: access.project };
}

// ---------- Copy prompt ----------

/**
 * "Copia prompt per Claude": pins the current version, renders the full text with the marker,
 * moves the task to "In corso" and returns the text to copy. Someone else's active run on the
 * same task is only a soft warning (returned, never blocking).
 */
export async function startRun(db: Db, env: CloudflareEnv, actor: Actor, promptId: string) {
  const { prompt: row, project: proj } = await authorizePrompt(
    db,
    actor,
    promptId,
    'project:run_prompt',
  );
  const [task] = row.taskId
    ? await db.select().from(taskMeta).where(eq(taskMeta.id, row.taskId)).limit(1)
    : [];
  if (!task || task.orphanedAt)
    throw new ApiError('bad_request', 'La task di questo prompt non c’è più nella repo.');
  if (!row.currentVersionId) throw new ApiError('bad_request', 'Il prompt è vuoto.');
  const [[version], [file], [repo], [assignee], others, footer] = await Promise.all([
    db.select().from(promptVersion).where(eq(promptVersion.id, row.currentVersionId)).limit(1),
    db
      .select({ parsed: taskFile.parsed })
      .from(taskFile)
      .where(and(eq(taskFile.projectId, proj.id), eq(taskFile.path, task.path)))
      .limit(1),
    db.select().from(githubRepo).where(eq(githubRepo.id, proj.repoId)).limit(1),
    task.assigneeId
      ? db.select({ name: user.name }).from(user).where(eq(user.id, task.assigneeId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ name: user.name })
      .from(promptRun)
      .innerJoin(user, eq(user.id, promptRun.launchedBy))
      .where(
        and(
          eq(promptRun.taskId, task.id),
          inArray(promptRun.state, ACTIVE_RUN_STATES),
          ne(promptRun.launchedBy, actor.id),
        ),
      ),
    promptFooter(db),
  ]);
  if (!version || !version.body.trim()) throw new ApiError('bad_request', 'Il prompt è vuoto.');

  const parsed = file ? (JSON.parse(file.parsed) as { tasks: StoredTask[] }).tasks : [];
  const subtasks = parsed.filter((t) => t.parentId === task.stableId);

  let id = generateRunId();
  for (let i = 0; i < 3; i++) {
    const [clash] = await db
      .select({ id: promptRun.id })
      .from(promptRun)
      .where(eq(promptRun.id, id))
      .limit(1);
    if (!clash) break;
    id = generateRunId();
  }
  const branch = suggestedBranch(id, plain(task.text));
  const { text, unknown } = buildFullPrompt(version.body, footer.footer, {
    project: proj.name,
    repo: repo?.fullName ?? '',
    task: plain(task.text),
    file: task.path,
    section: (JSON.parse(task.headingPath) as string[]).join(' › '),
    branch,
    assignee: assignee?.name ?? '',
    subtasks: subtaskList(subtasks.map((s) => ({ text: plain(s.text), done: s.done }))),
    run_id: id,
  });
  const now = new Date();
  const run: typeof promptRun.$inferInsert = {
    id,
    projectId: proj.id,
    taskId: task.id,
    taskStableId: task.stableId,
    taskText: task.text,
    promptId: row.id,
    promptVersionId: version.id,
    renderedText: text,
    launchedBy: actor.id,
    copiedAt: now,
    state: 'copied',
    branch,
    updatedAt: now,
  };
  await db.batch([
    db.insert(promptRun).values(run),
    db.update(prompt).set({ status: 'used', updatedAt: now }).where(eq(prompt.id, row.id)),
  ]);
  await logRunEvent(
    db,
    { id, projectId: proj.id, taskId: task.id, taskText: task.text },
    actor.id,
    'run_started',
  );

  // Copying a prompt means someone is working on it: the card goes to "In corso".
  const [inProgress] = await db
    .select()
    .from(kanbanColumn)
    .where(and(eq(kanbanColumn.projectId, proj.id), eq(kanbanColumn.isInProgress, true)))
    .limit(1);
  if (inProgress && !task.done && task.columnId !== inProgress.id)
    await updateTaskMeta(db, env, actor, proj.id, task.id, {
      move: { columnId: inProgress.id, index: 0 },
    });
  await runsChanged(env, proj.id, actor.id);

  const saved = await loadRun(db, id);
  return {
    run: runView(saved, null, version.number),
    text,
    unknown,
    othersActive: [...new Set(others.map((o) => o.name))],
  };
}

// ---------- Linking and state ----------

/** Who acts for an automatic close: the launcher if still a contributor, else the owner. */
async function automationActor(db: Db, run: RunRow, proj: ProjectRow): Promise<Actor | null> {
  const members = await db
    .select({ userId: projectMember.userId, role: projectMember.role })
    .from(projectMember)
    .where(eq(projectMember.projectId, proj.id));
  const allowed = (m: { userId: string; role: string }) =>
    can(
      { id: m.userId, role: 'user' },
      'project:edit_tasks',
      projectResource(proj, m.role as ProjectRole),
    );
  const launcher = members.find((m) => m.userId === run.launchedBy && allowed(m));
  const owner = members.find((m) => m.role === 'owner' && allowed(m));
  const chosen = launcher ?? owner;
  return chosen ? { id: chosen.userId, role: 'user' } : null;
}

/** Merge of a certainly-linked PR: tick the task in the repo (one commit), "Fatto" column. */
async function closeTaskForRun(db: Db, env: CloudflareEnv, run: RunRow, proj: ProjectRow) {
  if (!run.taskId) return false;
  const [task] = await db.select().from(taskMeta).where(eq(taskMeta.id, run.taskId)).limit(1);
  if (!task || task.orphanedAt || task.done) return false;
  const actor = await automationActor(db, run, proj);
  if (!actor) return false;
  try {
    await setDone(db, env, actor, proj.id, task.id, true);
  } catch (error) {
    console.warn('Automatic close after merge failed', error);
    await logRunEvent(db, run, null, 'run_close_failed', {
      message: error instanceof Error ? error.message.slice(0, 200) : 'error',
    });
    return false;
  }
  await db
    .update(promptRun)
    .set({ taskClosedByRun: true, updatedAt: new Date() })
    .where(eq(promptRun.id, run.id));
  await logRunEvent(db, run, actor.id, 'run_task_closed');
  return true;
}

/**
 * Aligns a run with what GitHub says about its PR: state (CI from the head commit's check runs),
 * link fields, events for each change, automatic close on merge.
 */
async function syncRunWithPull(
  db: Db,
  env: CloudflareEnv,
  run: RunRow,
  proj: ProjectRow,
  access: RepoAccess,
  pull: GhPull,
  source: LinkSource,
  actorId: string | null,
) {
  const merged = isMerged(pull);
  const checks =
    merged || pull.state === 'closed'
      ? []
      : await checkRuns(access.config, access.token, access.ref, pull.head.sha).catch(
          (error: unknown) => {
            console.warn('check runs unavailable', error);
            return [];
          },
        );
  const state: RunState = runStateFrom({ state: pull.state, merged }, checks);
  const firstLink = run.prNumber !== pull.number;
  const values: Partial<typeof promptRun.$inferInsert> = {
    prNumber: pull.number,
    prUrl: pull.html_url,
    prTitle: pull.title,
    prHeadSha: pull.head.sha,
    branch: pull.head.ref,
    linkSource: firstLink ? source : run.linkSource,
    mergedAt: pull.merged_at ? new Date(pull.merged_at) : null,
    updatedAt: new Date(),
  };
  // An abandoned run stays abandoned unless its PR moves on.
  if (run.state !== 'abandoned' || merged) values.state = state;
  await db.update(promptRun).set(values).where(eq(promptRun.id, run.id));
  const next = { ...run, ...values } as RunRow;
  if (firstLink) {
    await logRunEvent(db, run, actorId, 'run_linked', {
      pr: pull.number,
      source: values.linkSource,
    });
    await notifyRunSafely(db, env, run, 'linked', pull.number);
  }
  if (values.state && values.state !== run.state && !firstLink) {
    await logRunEvent(db, run, actorId, `run_${values.state}`, { pr: pull.number });
    if (values.state === 'ci_failed') await notifyRunSafely(db, env, run, 'ci_failed', pull.number);
  }

  let closed = false;
  if (merged && run.state !== 'merged' && !run.taskClosedByRun) {
    await logRunEvent(db, run, null, 'run_merged', { pr: pull.number });
    closed = await closeTaskForRun(db, env, next, proj);
    await notifyRunSafely(db, env, run, 'merged', pull.number);
  }
  await runsChanged(
    env,
    proj.id,
    actorId,
    closed ? { runId: run.id, taskText: run.taskText, launchedBy: run.launchedBy } : undefined,
  );
  return next;
}

async function projectByRepo(db: Db, githubRepoId: number) {
  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.githubRepoId, githubRepoId), isNull(project.archivedAt)))
    .limit(1);
  return proj ?? null;
}

/**
 * Webhook `pull_request`: the marker in the description (or, failing that, in the commit
 * trailers) links the PR; runs already linked to it just follow its state.
 */
export async function handlePullRequestEvent(
  db: Db,
  env: CloudflareEnv,
  githubRepoId: number,
  pull: GhPull,
) {
  const proj = await projectByRepo(db, githubRepoId);
  if (!proj) return 0;
  const waiting = await db
    .select()
    .from(promptRun)
    .where(and(eq(promptRun.projectId, proj.id), isNull(promptRun.prNumber)));
  const linked = await db
    .select()
    .from(promptRun)
    .where(and(eq(promptRun.projectId, proj.id), eq(promptRun.prNumber, pull.number)));
  if (!waiting.length && !linked.length) return 0;
  const access = await repoAccess(db, env, proj, null);
  let markers = parseMarkers(pull.body);
  if (!markers.some((m) => waiting.some((r) => r.id === m)) && waiting.length) {
    // Only worth a request when some run is still looking for its PR.
    const messages = await pullCommitMessages(
      access.config,
      access.token,
      access.ref,
      pull.number,
    ).catch((error: unknown) => {
      console.warn('PR commits unavailable', error);
      return [] as string[];
    });
    markers = [...new Set([...markers, ...parseMarkers(messages.join('\n\n'))])];
  }
  const targets = [
    ...linked,
    ...waiting.filter((r) => markers.includes(r.id) && !linked.some((l) => l.id === r.id)),
  ];
  for (const run of targets)
    await syncRunWithPull(db, env, run, proj, access, pull, 'marker', null);
  return targets.length;
}

/** Webhook `check_suite` / `check_run`: refresh CI of the runs whose PR head is this commit. */
export async function handleChecksEvent(
  db: Db,
  env: CloudflareEnv,
  githubRepoId: number,
  headSha: string,
) {
  const proj = await projectByRepo(db, githubRepoId);
  if (!proj) return 0;
  const runs = await db
    .select()
    .from(promptRun)
    .where(and(eq(promptRun.projectId, proj.id), eq(promptRun.prHeadSha, headSha)));
  const open = runs.filter((r) => r.prNumber && !['merged', 'closed'].includes(r.state));
  if (!open.length) return 0;
  const access = await repoAccess(db, env, proj, null);
  const checks = await checkRuns(access.config, access.token, access.ref, headSha);
  for (const run of open) {
    const state = runStateFrom({ state: 'open', merged: false }, checks);
    if (state === run.state) continue;
    await db
      .update(promptRun)
      .set({ state, updatedAt: new Date() })
      .where(eq(promptRun.id, run.id));
    await logRunEvent(db, run, null, `run_${state}`, { pr: run.prNumber });
    if (state === 'ci_failed') await notifyRunSafely(db, env, run, 'ci_failed', run.prNumber);
  }
  await runsChanged(env, proj.id, null);
  return open.length;
}

/**
 * Webhook `push`: commits carrying a marker tell which branch a run is on. If a PR from that
 * branch is already open it gets linked now; otherwise the pull_request event will.
 */
export async function handlePushMarkers(
  db: Db,
  env: CloudflareEnv,
  githubRepoId: number,
  branch: string,
  messages: string[],
) {
  const ids = parseMarkers(messages.join('\n\n'));
  if (!ids.length) return 0;
  const proj = await projectByRepo(db, githubRepoId);
  if (!proj) return 0;
  const runs = await db
    .select()
    .from(promptRun)
    .where(
      and(
        eq(promptRun.projectId, proj.id),
        inArray(promptRun.id, ids.slice(0, 20)),
        isNull(promptRun.prNumber),
      ),
    );
  if (!runs.length) return 0;
  const access = await repoAccess(db, env, proj, null);
  const [pull] = (await listPulls(access.config, access.token, access.ref, 'open', 50)).filter(
    (p) => p.head.ref === branch,
  );
  for (const run of runs) {
    if (pull) await syncRunWithPull(db, env, run, proj, access, pull, 'marker', null);
    else
      await db
        .update(promptRun)
        .set({ branch, updatedAt: new Date() })
        .where(eq(promptRun.id, run.id));
  }
  return runs.length;
}

// ---------- Actions from the UI ----------

/**
 * "Verifica stato PR": reads the real state from GitHub. A linked run is refreshed; an unlinked
 * one is searched by marker among the recent PRs (description, then commits of the newest ones).
 */
export async function verifyRun(db: Db, env: CloudflareEnv, actor: Actor, runId: string) {
  const { run, project: proj } = await authorizeRun(db, actor, runId, 'project:run_prompt');
  const access = await repoAccess(db, env, proj, actor.id);
  if (run.prNumber) {
    const pull = await getPull(access.config, access.token, access.ref, run.prNumber);
    await syncRunWithPull(db, env, run, proj, access, pull, run.linkSource as LinkSource, actor.id);
    return { found: true };
  }
  const pulls = (await listPulls(access.config, access.token, access.ref, 'all', 30)).filter(
    (p) => new Date(p.created_at).getTime() >= run.copiedAt.getTime() - 60_000,
  );
  let match = pulls.find((p) => parseMarkers(p.body).includes(run.id));
  for (const p of pulls.slice(0, 8)) {
    if (match) break;
    const messages = await pullCommitMessages(access.config, access.token, access.ref, p.number);
    if (parseMarkers(messages.join('\n\n')).includes(run.id)) match = p;
  }
  if (!match) return { found: false };
  await syncRunWithPull(db, env, run, proj, access, match, 'marker', actor.id);
  return { found: true };
}

/** The fallback: the most likely PR for a run without marker, to confirm with one tap. */
export async function suggestionForRun(db: Db, env: CloudflareEnv, actor: Actor, runId: string) {
  const { run, project: proj } = await authorizeRun(db, actor, runId, 'project:view');
  if (run.prNumber) return null;
  const access = await repoAccess(db, env, proj, actor.id);
  const [pulls, taken, [login]] = await Promise.all([
    listPulls(access.config, access.token, access.ref, 'all', 30),
    db
      .select({ pr: promptRun.prNumber })
      .from(promptRun)
      .where(and(eq(promptRun.projectId, proj.id), ne(promptRun.id, run.id))),
    run.launchedBy
      ? db
          .select({ login: githubConnection.login })
          .from(githubConnection)
          .where(eq(githubConnection.userId, run.launchedBy))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const used = new Set(taken.map((t) => t.pr));
  const best = suggestPull(
    {
      id: run.id,
      taskText: plain(run.taskText),
      copiedAt: run.copiedAt.toISOString(),
      launcherLogin: login?.login ?? null,
    },
    pulls.filter((p) => !used.has(p.number)).map(toCandidate),
  );
  if (!best) return null;
  const pull = pulls.find((p) => p.number === best.pull.number);
  return {
    number: best.pull.number,
    title: best.pull.title,
    url: pull?.html_url ?? null,
    reasons: best.reasons,
  };
}

/** Manual link, or confirmation of a suggestion. */
export async function linkRun(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  runId: string,
  prNumber: number,
  source: 'manual' | 'suggested',
) {
  const { run, project: proj } = await authorizeRun(db, actor, runId, 'project:run_prompt');
  const access = await repoAccess(db, env, proj, actor.id);
  let pull: GhPull;
  try {
    pull = await getPull(access.config, access.token, access.ref, prNumber);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404)
      throw new ApiError('bad_request', `Nella repo non c’è la PR #${prNumber}.`);
    throw error;
  }
  await syncRunWithPull(db, env, { ...run, prNumber: null }, proj, access, pull, source, actor.id);
}

/** "Annulla chiusura": reopens the task closed by the merge (inverse commit), back to "In corso". */
export async function undoRunClose(db: Db, env: CloudflareEnv, actor: Actor, runId: string) {
  const { run, project: proj } = await authorizeRun(db, actor, runId, 'project:run_prompt');
  if (!run.taskClosedByRun || !run.taskId) throw new ApiError('conflict', 'Niente da annullare.');
  await setDone(db, env, actor, proj.id, run.taskId, false);
  const [inProgress] = await db
    .select()
    .from(kanbanColumn)
    .where(and(eq(kanbanColumn.projectId, proj.id), eq(kanbanColumn.isInProgress, true)))
    .limit(1);
  if (inProgress)
    await updateTaskMeta(db, env, actor, proj.id, run.taskId, {
      move: { columnId: inProgress.id, index: 0 },
    });
  await db
    .update(promptRun)
    .set({ taskClosedByRun: false, updatedAt: new Date() })
    .where(eq(promptRun.id, run.id));
  await logRunEvent(db, run, actor.id, 'run_task_reopened');
  await runsChanged(env, proj.id, actor.id);
}

export async function updateRun(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  runId: string,
  patch: { resultNotes?: string | null; abandoned?: boolean },
) {
  const { run, project: proj } = await authorizeRun(db, actor, runId, 'project:run_prompt');
  const values: Partial<typeof promptRun.$inferInsert> = { updatedAt: new Date() };
  if (patch.resultNotes !== undefined) values.resultNotes = patch.resultNotes || null;
  if (patch.abandoned && (ACTIVE_RUN_STATES as string[]).includes(run.state))
    values.state = 'abandoned';
  await db.update(promptRun).set(values).where(eq(promptRun.id, run.id));
  if (values.state) await logRunEvent(db, run, actor.id, 'run_abandoned');
  await runsChanged(env, proj.id, actor.id);
}

/** The exact text of a run, to copy it again. */
export async function runText(db: Db, actor: Actor, runId: string) {
  const { run } = await authorizeRun(db, actor, runId, 'project:view');
  return { text: run.renderedText };
}

/** Latest run per task, for the cards. */
export async function latestRunsByTask(db: Db, projectId: string) {
  const rows = await db
    .select({
      id: promptRun.id,
      taskId: promptRun.taskId,
      state: promptRun.state,
      prNumber: promptRun.prNumber,
      prUrl: promptRun.prUrl,
    })
    .from(promptRun)
    .where(eq(promptRun.projectId, projectId))
    .orderBy(desc(promptRun.copiedAt))
    .limit(500);
  const map = new Map<string, Omit<(typeof rows)[number], 'taskId'>>();
  for (const { taskId, ...run } of rows) if (taskId && !map.has(taskId)) map.set(taskId, run);
  return map;
}
