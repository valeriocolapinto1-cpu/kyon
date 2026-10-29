import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import {
  buildIcs,
  likeContains,
  safeResumePath,
  sha256Hex,
  toBase64,
  type Actor,
} from '@kyon/core';
import type { Db } from '@/db/client';
import {
  activityEvent,
  chatMessage,
  chatRoom,
  githubConnection,
  project,
  projectMember,
  prompt,
  promptRun,
  taskMeta,
  user,
} from '@/db/schema';
import { inChunks } from './d1';
import { ApiError } from './errors';
import { listVisibleRepos } from './github/repos';
import { avatarUrl } from './users';

/**
 * Everything here is filtered by project membership first: a project you are not in (and the
 * repo behind it) never shows up, not even as a count.
 */
export async function memberProjects(db: Db, actorId: string) {
  return db
    .select({ id: project.id, name: project.name, archivedAt: project.archivedAt })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .where(eq(projectMember.userId, actorId));
}

type Projects = Awaited<ReturnType<typeof memberProjects>>;

const OPEN_RUN_STATES = ['copied', 'pr_open', 'ci_running', 'ci_failed', 'ci_passed'];

export interface ActivityView {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  project: { id: string; name: string } | null;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    console.warn('Invalid activity payload', error);
    return {};
  }
}

/** Activity of the given projects, newest first (optionally by one person, before a date). */
export async function activityOf(
  db: Db,
  projects: Projects,
  options: { limit: number; before?: Date; actorId?: string; types?: string[] },
): Promise<ActivityView[]> {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const rows = await inChunks(
    projects.map((p) => p.id),
    (ids) =>
      db
        .select({
          event: activityEvent,
          actorName: user.name,
          actorAvatar: user.avatarKey,
        })
        .from(activityEvent)
        .leftJoin(user, eq(user.id, activityEvent.actorId))
        .where(
          and(
            inArray(activityEvent.projectId, ids),
            options.before ? lt(activityEvent.createdAt, options.before) : undefined,
            options.actorId ? eq(activityEvent.actorId, options.actorId) : undefined,
            options.types ? inArray(activityEvent.type, options.types) : undefined,
          ),
        )
        .orderBy(desc(activityEvent.createdAt))
        .limit(options.limit),
  );
  return rows
    .sort((a, b) => b.event.createdAt.getTime() - a.event.createdAt.getTime())
    .slice(0, options.limit)
    .map(({ event, actorName, actorAvatar }) => ({
      id: event.id,
      type: event.type,
      payload: parsePayload(event.payload),
      createdAt: event.createdAt.toISOString(),
      actor: event.actorId
        ? {
            id: event.actorId,
            name: actorName ?? '',
            avatarUrl: avatarUrl(event.actorId, actorAvatar),
          }
        : null,
      project: event.projectId
        ? { id: event.projectId, name: names.get(event.projectId) ?? '' }
        : null,
    }));
}

/** Tasks assigned to me, still open, soonest due first (no date last). */
async function myTasks(db: Db, actor: Actor, projects: Projects) {
  const active = projects.filter((p) => !p.archivedAt);
  const names = new Map(active.map((p) => [p.id, p.name]));
  const rows = await inChunks(
    active.map((p) => p.id),
    (ids) =>
      db
        .select({
          id: taskMeta.id,
          projectId: taskMeta.projectId,
          text: taskMeta.text,
          priority: taskMeta.priority,
          dueDate: taskMeta.dueDate,
        })
        .from(taskMeta)
        .where(
          and(
            inArray(taskMeta.projectId, ids),
            eq(taskMeta.assigneeId, actor.id),
            eq(taskMeta.done, false),
            isNull(taskMeta.orphanedAt),
          ),
        )
        .orderBy(sql`${taskMeta.dueDate} IS NULL`, asc(taskMeta.dueDate))
        .limit(8),
  );
  return rows
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 8)
    .map((r) => ({ ...r, projectName: names.get(r.projectId) ?? '' }));
}

/** Runs still moving (copied, PR open, CI) in my projects; mine first. */
async function openRuns(db: Db, actor: Actor, projects: Projects) {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const rows = await inChunks(
    projects.filter((p) => !p.archivedAt).map((p) => p.id),
    (ids) =>
      db
        .select({
          id: promptRun.id,
          projectId: promptRun.projectId,
          taskId: promptRun.taskId,
          taskText: promptRun.taskText,
          state: promptRun.state,
          prNumber: promptRun.prNumber,
          prUrl: promptRun.prUrl,
          copiedAt: promptRun.copiedAt,
          launchedBy: promptRun.launchedBy,
          launchedByName: user.name,
        })
        .from(promptRun)
        .leftJoin(user, eq(user.id, promptRun.launchedBy))
        .where(and(inArray(promptRun.projectId, ids), inArray(promptRun.state, OPEN_RUN_STATES)))
        .orderBy(desc(promptRun.copiedAt))
        .limit(10),
  );
  return rows
    .sort(
      (a, b) =>
        Number(b.launchedBy === actor.id) - Number(a.launchedBy === actor.id) ||
        b.copiedAt.getTime() - a.copiedAt.getTime(),
    )
    .slice(0, 8)
    .map(({ launchedBy, launchedByName, copiedAt, ...r }) => ({
      ...r,
      projectName: names.get(r.projectId) ?? '',
      copiedAt: copiedAt.toISOString(),
      launchedBy: launchedBy ? { id: launchedBy, name: launchedByName ?? '' } : null,
    }));
}

/** The newest comments in project threads and task comments (not the busy project chat). */
async function recentComments(db: Db, projects: Projects) {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const rows = await inChunks(
    projects.map((p) => p.id),
    (ids) =>
      db
        .select({
          id: chatMessage.id,
          roomId: chatMessage.roomId,
          body: chatMessage.body,
          createdAt: chatMessage.createdAt,
          authorId: chatMessage.authorId,
          authorName: user.name,
          authorAvatar: user.avatarKey,
          kind: chatRoom.kind,
          projectId: chatRoom.projectId,
          taskId: chatRoom.taskId,
          title: chatRoom.title,
          taskText: taskMeta.text,
        })
        .from(chatMessage)
        .innerJoin(chatRoom, eq(chatRoom.id, chatMessage.roomId))
        .leftJoin(user, eq(user.id, chatMessage.authorId))
        .leftJoin(taskMeta, eq(taskMeta.id, chatRoom.taskId))
        .where(
          and(
            inArray(chatRoom.projectId, ids),
            inArray(chatRoom.kind, ['thread', 'task']),
            isNull(chatMessage.deletedAt),
          ),
        )
        .orderBy(desc(chatMessage.createdAt))
        .limit(6),
  );
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      roomId: r.roomId,
      kind: r.kind as 'thread' | 'task',
      excerpt: r.body.slice(0, 160),
      createdAt: r.createdAt.toISOString(),
      author: r.authorId
        ? {
            id: r.authorId,
            name: r.authorName ?? '',
            avatarUrl: avatarUrl(r.authorId, r.authorAvatar),
          }
        : null,
      projectId: r.projectId ?? '',
      projectName: names.get(r.projectId ?? '') ?? '',
      taskId: r.taskId,
      // A thread's title, or the task the comment is about.
      context: r.kind === 'task' ? (r.taskText ?? '') : (r.title ?? ''),
    }));
}

function parseLocation(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { path?: unknown; title?: unknown; at?: unknown };
    const path = safeResumePath(parsed.path);
    if (!path) return null;
    return {
      path,
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : '',
      at: typeof parsed.at === 'string' ? parsed.at : null,
    };
  } catch (error) {
    console.warn('Invalid last location', error);
    return null;
  }
}

export async function homeData(db: Db, actor: Actor) {
  const projects = await memberProjects(db, actor.id);
  const [contributions, tasks, runs, comments, [me]] = await Promise.all([
    activityOf(db, projects, { limit: 10 }),
    myTasks(db, actor, projects),
    openRuns(db, actor, projects),
    recentComments(db, projects),
    db.select({ lastLocation: user.lastLocation }).from(user).where(eq(user.id, actor.id)),
  ]);
  return {
    contributions,
    myTasks: tasks,
    runs,
    comments,
    lastLocation: parseLocation(me?.lastLocation ?? null),
  };
}

export async function saveLocation(db: Db, actor: Actor, path: string, title: string) {
  const safe = safeResumePath(path);
  if (!safe) throw new ApiError('bad_request');
  await db
    .update(user)
    .set({ lastLocation: JSON.stringify({ path: safe, title, at: new Date().toISOString() }) })
    .where(eq(user.id, actor.id));
}

export async function finishTour(db: Db, actor: Actor, done: boolean) {
  await db
    .update(user)
    .set({ tourDoneAt: done ? new Date() : null })
    .where(eq(user.id, actor.id));
}

// ---------- Global search ----------

export async function globalSearch(db: Db, actor: Actor, query: string) {
  const q = query.trim().slice(0, 100);
  const empty = { projects: [], tasks: [], prompts: [] };
  if (q.length < 2) return empty;
  const projects = await memberProjects(db, actor.id);
  if (!projects.length) return empty;
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const pattern = likeContains(q);
  const ids = projects.map((p) => p.id);
  const [tasks, prompts] = await Promise.all([
    inChunks(ids, (slice) =>
      db
        .select({
          id: taskMeta.id,
          projectId: taskMeta.projectId,
          text: taskMeta.text,
          done: taskMeta.done,
        })
        .from(taskMeta)
        .where(
          and(
            inArray(taskMeta.projectId, slice),
            isNull(taskMeta.orphanedAt),
            sql`${taskMeta.text} LIKE ${pattern} ESCAPE '\\'`,
          ),
        )
        .orderBy(asc(taskMeta.done), desc(taskMeta.updatedAt))
        .limit(8),
    ),
    inChunks(ids, (slice) =>
      db
        .select({
          id: prompt.id,
          projectId: prompt.projectId,
          title: prompt.title,
          taskId: prompt.taskId,
        })
        .from(prompt)
        .where(
          and(inArray(prompt.projectId, slice), sql`${prompt.title} LIKE ${pattern} ESCAPE '\\'`),
        )
        .orderBy(desc(prompt.updatedAt))
        .limit(6),
    ),
  ]);
  const folded = q.toLocaleLowerCase('it');
  return {
    projects: projects
      .filter((p) => p.name.toLocaleLowerCase('it').includes(folded))
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null })),
    tasks: tasks.slice(0, 8).map((t) => ({ ...t, projectName: names.get(t.projectId) ?? '' })),
    prompts: prompts.slice(0, 6).map((p) => ({ ...p, projectName: names.get(p.projectId) ?? '' })),
  };
}

// ---------- People ----------

export async function personProfile(db: Db, actor: Actor, personId: string) {
  const [person] = await db
    .select({
      id: user.id,
      name: user.name,
      bio: user.bio,
      statusText: user.statusText,
      nameColor: user.nameColor,
      avatarKey: user.avatarKey,
      role: user.role,
      createdAt: user.createdAt,
      githubLogin: githubConnection.login,
    })
    .from(user)
    .leftJoin(githubConnection, eq(githubConnection.userId, user.id))
    .where(eq(user.id, personId))
    .limit(1);
  if (!person) throw new ApiError('not_found');

  const mine = await memberProjects(db, actor.id);
  const theirs = new Set(
    (
      await db
        .select({ projectId: projectMember.projectId })
        .from(projectMember)
        .where(eq(projectMember.userId, personId))
    ).map((r) => r.projectId),
  );
  // Only what both of you are in: their other projects stay invisible.
  const common = mine.filter((p) => theirs.has(p.id));
  const [repos, activity, completed, runs] = await Promise.all([
    listVisibleRepos(db, actor),
    activityOf(db, common, { limit: 10, actorId: personId }),
    countEvents(db, common, personId, ['task_completed']),
    countRuns(db, common, personId),
  ]);
  return {
    id: person.id,
    name: person.name,
    bio: person.bio,
    statusText: person.statusText,
    nameColor: person.nameColor,
    avatarUrl: avatarUrl(person.id, person.avatarKey),
    admin: person.role === 'admin',
    githubLogin: person.githubLogin,
    memberSince: person.createdAt.toISOString(),
    repos: repos
      .filter((r) => r.exposedBy.id === personId && r.exposure !== 'hidden')
      .map((r) => ({ id: r.id, fullName: r.fullName, htmlUrl: r.htmlUrl, projectId: r.projectId })),
    projects: common.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null })),
    activity,
    stats: { tasksCompleted: completed, runs },
  };
}

async function countEvents(db: Db, projects: Projects, actorId: string, types: string[]) {
  const counts = await inChunks(
    projects.map((p) => p.id),
    (ids) =>
      db
        .select({ value: sql<number>`count(*)` })
        .from(activityEvent)
        .where(
          and(
            inArray(activityEvent.projectId, ids),
            eq(activityEvent.actorId, actorId),
            inArray(activityEvent.type, types),
          ),
        ),
  );
  return counts.reduce((sum, r) => sum + Number(r.value), 0);
}

async function countRuns(db: Db, projects: Projects, actorId: string) {
  const counts = await inChunks(
    projects.map((p) => p.id),
    (ids) =>
      db
        .select({ value: sql<number>`count(*)` })
        .from(promptRun)
        .where(and(inArray(promptRun.projectId, ids), eq(promptRun.launchedBy, actorId))),
  );
  return counts.reduce((sum, r) => sum + Number(r.value), 0);
}

// ---------- Calendar feed (.ics) ----------

const hashIcsToken = (token: string) => sha256Hex(`kyon-ics:${token}`);

/** A new secret feed URL (the old one stops working). Shown once: only its hash is stored. */
export async function rotateIcsToken(db: Db, actor: Actor) {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await db
    .update(user)
    .set({ icsTokenHash: await hashIcsToken(token) })
    .where(eq(user.id, actor.id));
  return token;
}

export async function revokeIcsToken(db: Db, actor: Actor) {
  await db.update(user).set({ icsTokenHash: null }).where(eq(user.id, actor.id));
}

export async function hasIcsToken(db: Db, actor: Actor) {
  const [row] = await db
    .select({ hash: user.icsTokenHash })
    .from(user)
    .where(eq(user.id, actor.id))
    .limit(1);
  return Boolean(row?.hash);
}

/**
 * Open tasks with a due date in the feed owner's active projects. Assigned to them, or to
 * nobody: someone else's deadlines would only be noise in a personal calendar.
 */
export async function icsFeed(db: Db, token: string, origin: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(isNotNull(user.icsTokenHash), eq(user.icsTokenHash, await hashIcsToken(token))))
    .limit(1);
  if (!owner) return null;
  const projects = (await memberProjects(db, owner.id)).filter((p) => !p.archivedAt);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const rows = await inChunks(
    projects.map((p) => p.id),
    (ids) =>
      db
        .select({
          id: taskMeta.id,
          projectId: taskMeta.projectId,
          text: taskMeta.text,
          dueDate: taskMeta.dueDate,
          assigneeId: taskMeta.assigneeId,
        })
        .from(taskMeta)
        .where(
          and(
            inArray(taskMeta.projectId, ids),
            isNotNull(taskMeta.dueDate),
            eq(taskMeta.done, false),
            isNull(taskMeta.orphanedAt),
            or(isNull(taskMeta.assigneeId), eq(taskMeta.assigneeId, owner.id)),
          ),
        )
        .limit(500),
  );
  return buildIcs(
    'Kyon — scadenze',
    rows.map((t) => ({
      uid: `${t.id}@kyon`,
      day: t.dueDate ?? '',
      summary: `${names.get(t.projectId) ?? ''}: ${t.text}`,
      description: t.assigneeId ? 'Assegnata a te' : 'Senza assegnatario',
      url: `${origin}/progetti?id=${encodeURIComponent(t.projectId)}&task=${encodeURIComponent(t.id)}`,
    })),
  );
}
