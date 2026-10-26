import { and, eq, inArray, lt } from 'drizzle-orm';
import { can, type Actor, type Exposure, type RepoResource } from '@kyon/core';
import type { Db } from '@/db/client';
import {
  githubConnection,
  githubRepo,
  githubRepoShare,
  project,
  projectMember,
  user,
} from '@/db/schema';
import { D1_MAX_PARAMS, chunk, inChunks, rowsPerInsert } from '../d1';
import { ApiError } from '../errors';
import { ghPaginate, type GitHubConfig } from './client';
import { getAccessToken } from './connections';

interface GhInstallation {
  id: number;
  account: { login: string } | null;
}

interface GhRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
}

/**
 * Refreshes the repos a user can reach through the GitHub App (user-to-server token: only repos
 * where the app is installed AND the user has access). Exposure choices are kept; repos no longer
 * reachable are marked unavailable instead of deleted.
 */
export async function syncRepos(
  db: Db,
  env: CloudflareEnv,
  config: GitHubConfig,
  userId: string,
): Promise<number> {
  const token = await getAccessToken(db, env, config, userId);
  if (!token)
    throw new ApiError('bad_request', 'Collega di nuovo GitHub: l’autorizzazione è scaduta.');
  const installations = await ghPaginate<{ installations: GhInstallation[] }, GhInstallation>(
    config,
    token,
    '/user/installations?per_page=100',
    (page) => page.installations,
  );
  const seen: number[] = [];
  const now = new Date();
  for (const installation of installations.slice(0, 10)) {
    const repos = await ghPaginate<{ repositories: GhRepo[] }, GhRepo>(
      config,
      token,
      `/user/installations/${installation.id}/repositories?per_page=100`,
      (page) => page.repositories,
      3,
    );
    for (const repo of repos) {
      seen.push(repo.id);
      const values = {
        installationId: installation.id,
        fullName: repo.full_name,
        ownerLogin: repo.owner.login,
        name: repo.name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        available: true,
        updatedAt: now,
      };
      await db
        .insert(githubRepo)
        .values({
          id: crypto.randomUUID(),
          userId,
          githubRepoId: repo.id,
          createdAt: now,
          ...values,
        })
        .onConflictDoUpdate({ target: [githubRepo.userId, githubRepo.githubRepoId], set: values });
    }
  }
  await db
    .update(githubRepo)
    .set({ available: false, updatedAt: now })
    // Every repo seen above was just stamped with `now`: the older ones are gone. (No NOT IN
    // list: D1 binds at most 100 parameters and a user can have more repos than that.)
    .where(and(eq(githubRepo.userId, userId), lt(githubRepo.updatedAt, now)));
  await db
    .update(githubConnection)
    .set({ lastSyncAt: now, lastError: null })
    .where(eq(githubConnection.userId, userId));
  return seen.length;
}

export type RepoRow = typeof githubRepo.$inferSelect;

export async function sharesFor(db: Db, repoIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (repoIds.length === 0) return map;
  const rows = await inChunks(repoIds, (ids) =>
    db.select().from(githubRepoShare).where(inArray(githubRepoShare.repoId, ids)),
  );
  for (const row of rows) map.set(row.repoId, [...(map.get(row.repoId) ?? []), row.userId]);
  return map;
}

export function repoResource(row: RepoRow, sharedWith: string[]): RepoResource {
  return {
    kind: 'repo',
    exposedBy: row.userId,
    exposure: row.exposure as Exposure,
    sharedWith,
    available: row.available,
  };
}

export interface RepoView {
  id: string;
  fullName: string;
  name: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
  exposure: Exposure;
  available: boolean;
  sharedWith: string[];
  exposedBy: { id: string; name: string };
  mine: boolean;
  projectId: string | null;
}

/** Repos the actor may see: their own (any exposure) plus others' exposed ones, filtered by can(). */
export async function listVisibleRepos(db: Db, actor: Actor): Promise<RepoView[]> {
  const rows = await db
    .select({ repo: githubRepo, ownerName: user.name, projectId: project.id })
    .from(githubRepo)
    .innerJoin(user, eq(user.id, githubRepo.userId))
    .leftJoin(project, eq(project.repoId, githubRepo.id))
    .orderBy(githubRepo.fullName);
  const shares = await sharesFor(
    db,
    rows.map((r) => r.repo.id),
  );
  return rows
    .filter(({ repo }) => can(actor, 'repo:view', repoResource(repo, shares.get(repo.id) ?? [])))
    .map(({ repo, ownerName, projectId }) => ({
      id: repo.id,
      fullName: repo.fullName,
      name: repo.name,
      htmlUrl: repo.htmlUrl,
      private: repo.private,
      defaultBranch: repo.defaultBranch,
      exposure: repo.exposure as Exposure,
      available: repo.available,
      // Only the exposing user learns who else it's shared with.
      sharedWith: repo.userId === actor.id ? (shares.get(repo.id) ?? []) : [],
      exposedBy: { id: repo.userId, name: ownerName },
      mine: repo.userId === actor.id,
      projectId,
    }));
}

export async function loadRepo(db: Db, repoId: string) {
  const [row] = await db.select().from(githubRepo).where(eq(githubRepo.id, repoId)).limit(1);
  if (!row) return null;
  const shares = await sharesFor(db, [row.id]);
  return { row, resource: repoResource(row, shares.get(row.id) ?? []) };
}

/**
 * Changes exposure. Members already in a project keep their access, but the owner is told who
 * can no longer see the repo (returned as names).
 */
export async function setExposure(
  db: Db,
  actor: Actor,
  repoId: string,
  exposure: Exposure,
  sharedWith: string[],
) {
  const loaded = await loadRepo(db, repoId);
  if (!loaded || !can(actor, 'repo:configure', loaded.resource)) throw new ApiError('not_found');
  const unique = [...new Set(sharedWith.filter((id) => id !== actor.id))];
  if (unique.length) {
    const existing = await inChunks(unique, (ids) =>
      db.select({ id: user.id }).from(user).where(inArray(user.id, ids)),
    );
    if (existing.length !== unique.length)
      throw new ApiError('bad_request', 'Una delle persone scelte non esiste.');
  }
  await db.batch([
    db.update(githubRepo).set({ exposure, updatedAt: new Date() }).where(eq(githubRepo.id, repoId)),
    db.delete(githubRepoShare).where(eq(githubRepoShare.repoId, repoId)),
    ...(exposure === 'selected' && unique.length
      ? chunk(unique, rowsPerInsert(2)).map((ids) =>
          db.insert(githubRepoShare).values(ids.map((userId) => ({ repoId, userId }))),
        )
      : []),
  ]);
  const after = await loadRepo(db, repoId);
  if (!after) return { lostAccess: [] as string[] };
  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.repoId, repoId))
    .limit(1);
  if (!proj) return { lostAccess: [] };
  const members = await db
    .select({ id: user.id, name: user.name, role: projectMember.role })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, proj.id));
  const lostAccess = members
    .filter((m) => !can({ id: m.id, role: 'user' }, 'repo:view', after.resource))
    .map((m) => m.name);
  return { lostAccess };
}

/** Webhook: repos removed from an installation are no longer reachable for anyone. */
export async function markReposUnavailable(db: Db, githubRepoIds: number[]) {
  if (githubRepoIds.length === 0) return;
  for (const ids of chunk(githubRepoIds, D1_MAX_PARAMS - 10))
    await db
      .update(githubRepo)
      .set({ available: false, updatedAt: new Date() })
      .where(inArray(githubRepo.githubRepoId, ids));
}

export async function markInstallationUnavailable(db: Db, installationId: number) {
  await db
    .update(githubRepo)
    .set({ available: false, updatedAt: new Date() })
    .where(eq(githubRepo.installationId, installationId));
}
