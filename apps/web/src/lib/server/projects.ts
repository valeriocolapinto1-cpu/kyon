import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  can,
  type Actor,
  type ProjectAction,
  type ProjectResource,
  type ProjectRole,
} from '@kyon/core';
import type { Db } from '@/db/client';
import { activityEvent, githubRepo, kanbanColumn, project, projectMember, user } from '@/db/schema';
import { chunk, inChunks, rowsPerInsert } from './d1';
import { ApiError } from './errors';
import { avatarUrl } from './users';
import { loadRepo } from './github/repos';
import { DEFAULT_COLUMNS } from './tasks/apply';

export type ProjectRow = typeof project.$inferSelect;

export const DEFAULT_PLAN_HEADINGS = [
  'piano',
  'todo',
  'to-do',
  'da fare',
  'fasi',
  'roadmap',
  'prossimi passi',
  'backlog',
  'task',
  'attività',
];

function parseList(value: string | null, fallback: string[]): string[] {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : fallback;
  } catch (error) {
    console.warn('Invalid JSON list on project', error);
    return fallback;
  }
}

export function projectResource(row: ProjectRow, role: ProjectRole | null): ProjectResource {
  return {
    kind: 'project',
    membership: role,
    viewersCanComment: row.viewersCanComment,
    archived: row.archivedAt !== null,
  };
}

/**
 * Loads a project and checks `action`. Non-members get 404, never 403: nobody can probe for
 * projects they can't see.
 */
export async function authorizeProject(
  db: Db,
  actor: Actor,
  projectId: string,
  action: ProjectAction,
) {
  const [row] = await db
    .select({ project, role: projectMember.role })
    .from(project)
    .leftJoin(
      projectMember,
      and(eq(projectMember.projectId, project.id), eq(projectMember.userId, actor.id)),
    )
    .where(eq(project.id, projectId))
    .limit(1);
  const role = (row?.role ?? null) as ProjectRole | null;
  if (!row || !role) throw new ApiError('not_found');
  if (!can(actor, action, projectResource(row.project, role))) {
    throw new ApiError(
      'forbidden',
      row.project.archivedAt
        ? 'Il progetto è archiviato: ripristinalo per modificarlo.'
        : undefined,
    );
  }
  return { project: row.project, role };
}

export interface ProjectSummary {
  id: string;
  name: string;
  role: ProjectRole;
  repoFullName: string;
  archived: boolean;
  updatedAt: string;
  /** The newest task ticked in this project (from the history), if any. */
  lastCompleted: { text: string; by: string | null; at: string } | null;
}

export async function listMyProjects(db: Db, actor: Actor): Promise<ProjectSummary[]> {
  const rows = await db
    .select({ project, role: projectMember.role, repoFullName: githubRepo.fullName })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .innerJoin(githubRepo, eq(githubRepo.id, project.repoId))
    .where(eq(projectMember.userId, actor.id))
    .orderBy(project.name);
  const last = await inChunks(
    rows.map((r) => r.project.id),
    (ids) =>
      db
        .select({
          projectId: activityEvent.projectId,
          payload: activityEvent.payload,
          createdAt: activityEvent.createdAt,
          by: user.name,
        })
        .from(activityEvent)
        .leftJoin(user, eq(user.id, activityEvent.actorId))
        .where(
          and(
            inArray(activityEvent.projectId, ids),
            eq(activityEvent.type, 'task_completed'),
            sql`${activityEvent.createdAt} = (SELECT max(b.created_at) FROM activity_event b WHERE b.project_id = ${activityEvent.projectId} AND b.type = 'task_completed')`,
          ),
        ),
  );
  const lastBy = new Map(last.map((e) => [e.projectId, e]));
  return rows.map((r) => {
    const done = lastBy.get(r.project.id);
    let text = '';
    try {
      text = done ? String((JSON.parse(done.payload) as { text?: unknown }).text ?? '') : '';
    } catch (error) {
      console.warn('Invalid activity payload', error);
    }
    return {
      id: r.project.id,
      name: r.project.name,
      role: r.role as ProjectRole,
      repoFullName: r.repoFullName,
      archived: r.project.archivedAt !== null,
      updatedAt: r.project.updatedAt.toISOString(),
      lastCompleted: done ? { text, by: done.by, at: done.createdAt.toISOString() } : null,
    };
  });
}

/** Everyone in the group who can see the repo (by its exposure), with names. */
async function usersWhoCanSeeRepo(db: Db, repoId: string) {
  const loaded = await loadRepo(db, repoId);
  if (!loaded) return [];
  const everyone = await db.select({ id: user.id, role: user.role }).from(user);
  return everyone.filter((u) =>
    can({ id: u.id, role: u.role === 'admin' ? 'admin' : 'user' }, 'repo:view', loaded.resource),
  );
}

export async function createProject(db: Db, actor: Actor, repoId: string, name: string) {
  const loaded = await loadRepo(db, repoId);
  if (!loaded || !can(actor, 'repo:view', loaded.resource)) throw new ApiError('not_found');
  if (!can(actor, 'repo:create_project', loaded.resource)) {
    throw new ApiError(
      'bad_request',
      'Esponi la repo (Settings → GitHub) prima di farne un progetto.',
    );
  }
  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.githubRepoId, loaded.row.githubRepoId))
    .limit(1);
  if (existing) throw new ApiError('conflict', 'Questa repo è già un progetto.');

  const id = crypto.randomUUID();
  const now = new Date();
  const viewers = await usersWhoCanSeeRepo(db, repoId);
  // Initial members: whoever can see the repo; the creator is the owner.
  const members = [
    { projectId: id, userId: actor.id, role: 'owner', createdAt: now },
    ...viewers
      .filter((u) => u.id !== actor.id)
      .map((u) => ({ projectId: id, userId: u.id, role: 'member', createdAt: now })),
  ];
  await db.batch([
    db.insert(project).values({
      id,
      name,
      repoId,
      githubRepoId: loaded.row.githubRepoId,
      createdAt: now,
      updatedAt: now,
    }),
    ...chunk(members, rowsPerInsert(4)).map((rows) => db.insert(projectMember).values(rows)),
    // Default kanban columns: Da fare · In corso · Fatto.
    db.insert(kanbanColumn).values(
      DEFAULT_COLUMNS.map((c, position) => ({
        id: crypto.randomUUID(),
        projectId: id,
        position,
        ...c,
      })),
    ),
  ]);
  return id;
}

export interface ProjectMemberView {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: ProjectRole;
  canSeeRepo: boolean;
}

export async function getProjectDetail(db: Db, actor: Actor, projectId: string) {
  const { project: row, role } = await authorizeProject(db, actor, projectId, 'project:view');
  const loaded = await loadRepo(db, row.repoId);
  const members = await db
    .select({ id: user.id, name: user.name, avatarKey: user.avatarKey, role: projectMember.role })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, projectId))
    .orderBy(user.name);
  const memberViews: ProjectMemberView[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: avatarUrl(m.id, m.avatarKey),
    role: m.role as ProjectRole,
    canSeeRepo: loaded ? can({ id: m.id, role: 'user' }, 'repo:view', loaded.resource) : false,
  }));
  // Candidates to add: group members who can see the repo and aren't in yet (owner only).
  const candidates =
    role === 'owner' && loaded
      ? (await usersWhoCanSeeRepo(db, row.repoId))
          .filter((u) => !members.some((m) => m.id === u.id))
          .map((u) => u.id)
      : [];
  const candidateUsers = await inChunks(candidates, (ids) =>
    db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)),
  );
  const permissions = Object.fromEntries(
    (
      [
        'project:edit_tasks',
        'project:write_prompt',
        'project:run_prompt',
        'project:comment',
        'project:chat',
        'project:settings',
        'project:manage_members',
        'project:transfer',
        'project:archive',
        'project:delete',
        'project:leave',
      ] as const
    ).map((action) => [action, can(actor, action, projectResource(row, role))]),
  );
  return {
    id: row.id,
    name: row.name,
    role,
    archived: row.archivedAt !== null,
    repo: loaded
      ? {
          fullName: loaded.row.fullName,
          htmlUrl: loaded.row.htmlUrl,
          defaultBranch: loaded.row.defaultBranch,
          available: loaded.row.available,
        }
      : null,
    settings: {
      commitMode: row.commitMode as 'direct' | 'branch_pr',
      workBranch: row.workBranch,
      viewersCanComment: row.viewersCanComment,
      planHeadings: parseList(row.planHeadings, DEFAULT_PLAN_HEADINGS),
      ignoreGlobs: parseList(row.ignoreGlobs, []),
      showArchive: row.showArchive,
    },
    members: memberViews,
    candidates: candidateUsers,
    permissions,
  };
}

export interface SettingsPatch {
  name?: string;
  commitMode?: 'direct' | 'branch_pr';
  workBranch?: string | null;
  viewersCanComment?: boolean;
  planHeadings?: string[];
  ignoreGlobs?: string[];
  showArchive?: boolean;
}

export async function updateProjectSettings(
  db: Db,
  actor: Actor,
  projectId: string,
  patch: SettingsPatch,
) {
  await authorizeProject(db, actor, projectId, 'project:settings');
  const values: Partial<typeof project.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.commitMode !== undefined) values.commitMode = patch.commitMode;
  if (patch.workBranch !== undefined) values.workBranch = patch.workBranch || null;
  if (patch.viewersCanComment !== undefined) values.viewersCanComment = patch.viewersCanComment;
  if (patch.planHeadings !== undefined) values.planHeadings = JSON.stringify(patch.planHeadings);
  if (patch.ignoreGlobs !== undefined) values.ignoreGlobs = JSON.stringify(patch.ignoreGlobs);
  if (patch.showArchive !== undefined) values.showArchive = patch.showArchive;
  await db.update(project).set(values).where(eq(project.id, projectId));
}

export async function addMember(
  db: Db,
  actor: Actor,
  projectId: string,
  userId: string,
  role: 'member' | 'viewer',
) {
  const { project: row } = await authorizeProject(db, actor, projectId, 'project:manage_members');
  const allowed = await usersWhoCanSeeRepo(db, row.repoId);
  // Adding someone would show them the repo's content: only people who can already see it.
  if (!allowed.some((u) => u.id === userId))
    throw new ApiError(
      'bad_request',
      'Questa persona non vede la repo: cambia prima la visibilità.',
    );
  await db
    .insert(projectMember)
    .values({ projectId, userId, role, createdAt: new Date() })
    .onConflictDoNothing();
}

export async function setMemberRole(
  db: Db,
  actor: Actor,
  projectId: string,
  userId: string,
  role: 'member' | 'viewer',
) {
  await authorizeProject(db, actor, projectId, 'project:manage_members');
  const updated = await db
    .update(projectMember)
    .set({ role })
    .where(
      and(
        eq(projectMember.projectId, projectId),
        eq(projectMember.userId, userId),
        inArray(projectMember.role, ['member', 'viewer']),
      ),
    )
    .returning({ userId: projectMember.userId });
  if (updated.length === 0)
    throw new ApiError('bad_request', 'Per cambiare il proprietario usa “Trasferisci proprietà”.');
}

export async function removeMember(db: Db, actor: Actor, projectId: string, userId: string) {
  await authorizeProject(db, actor, projectId, 'project:manage_members');
  if (userId === actor.id)
    throw new ApiError(
      'bad_request',
      'Il proprietario non può rimuoversi: trasferisci prima la proprietà.',
    );
  await db
    .delete(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)));
}

export async function leaveProject(db: Db, actor: Actor, projectId: string) {
  await authorizeProject(db, actor, projectId, 'project:leave');
  await db
    .delete(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, actor.id)));
}

export async function transferOwnership(db: Db, actor: Actor, projectId: string, toUserId: string) {
  await authorizeProject(db, actor, projectId, 'project:transfer');
  const [target] = await db
    .select()
    .from(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, toUserId)))
    .limit(1);
  if (!target || toUserId === actor.id)
    throw new ApiError('bad_request', 'Scegli un altro membro del progetto.');
  await db.batch([
    db
      .update(projectMember)
      .set({ role: 'owner' })
      .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, toUserId))),
    db
      .update(projectMember)
      .set({ role: 'member' })
      .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, actor.id))),
    db.update(project).set({ updatedAt: new Date() }).where(eq(project.id, projectId)),
  ]);
}

export async function setArchived(db: Db, actor: Actor, projectId: string, archived: boolean) {
  await authorizeProject(db, actor, projectId, 'project:archive');
  const now = new Date();
  await db
    .update(project)
    .set({ archivedAt: archived ? now : null, updatedAt: now })
    .where(eq(project.id, projectId));
}

/** Deletes Kyon's data for the project. The GitHub repo is never touched. */
export async function deleteProject(db: Db, actor: Actor, projectId: string, confirmName: string) {
  const { project: row } = await authorizeProject(db, actor, projectId, 'project:delete');
  if (confirmName.trim() !== row.name)
    throw new ApiError('bad_request', 'Scrivi esattamente il nome del progetto per confermare.');
  await db.delete(project).where(eq(project.id, projectId));
}
