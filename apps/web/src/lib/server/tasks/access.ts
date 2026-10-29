import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import type { project } from '@/db/schema';
import { githubRepo, user } from '@/db/schema';
import { ApiError } from '../errors';
import { githubConfig, type GitHubConfig } from '../github/client';
import { getAccessToken } from '../github/connections';
import type { RepoRef } from '../github/files';

/** Branch Kyon commits to in "branch + PR" mode. */
export const KYON_TASKS_BRANCH = 'kyon/tasks';

export interface RepoAccess {
  config: GitHubConfig;
  token: string;
  ref: RepoRef;
  defaultBranch: string;
  /** Set when acting through someone else's token: credited with a Co-authored-by trailer. */
  coAuthor: { name: string; email: string } | null;
}

/**
 * Token choice (spec §4.3.4): the acting user's own GitHub token if they can reach the repo,
 * otherwise the token of whoever exposed it (with a Co-authored-by trailer for the actor).
 */
export async function repoAccess(
  db: Db,
  env: CloudflareEnv,
  projectRow: typeof project.$inferSelect,
  actorId: string | null,
): Promise<RepoAccess> {
  const config = githubConfig(env);
  const [exposed] = await db
    .select()
    .from(githubRepo)
    .where(eq(githubRepo.id, projectRow.repoId))
    .limit(1);
  if (!exposed) throw new ApiError('not_found');
  const ref = { owner: exposed.ownerLogin, repo: exposed.name };

  if (actorId) {
    const [own] = await db
      .select()
      .from(githubRepo)
      .where(
        and(
          eq(githubRepo.userId, actorId),
          eq(githubRepo.githubRepoId, projectRow.githubRepoId),
          eq(githubRepo.available, true),
        ),
      )
      .limit(1);
    if (own) {
      const token = await getAccessToken(db, env, config, actorId);
      if (token)
        return { config, token, ref, defaultBranch: exposed.defaultBranch, coAuthor: null };
    }
  }
  const token = await getAccessToken(db, env, config, exposed.userId);
  if (!token)
    throw new ApiError(
      'bad_request',
      'Il collegamento GitHub di chi ha esposto la repo è scaduto: deve ricollegarlo.',
    );
  let coAuthor: RepoAccess['coAuthor'] = null;
  if (actorId && actorId !== exposed.userId) {
    const [actor] = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, actorId))
      .limit(1);
    if (actor) coAuthor = actor;
  }
  return { config, token, ref, defaultBranch: exposed.defaultBranch, coAuthor };
}

/** Branch tasks are read from (and written to in direct mode). */
export function readBranch(projectRow: typeof project.$inferSelect, defaultBranch: string): string {
  if (projectRow.commitMode === 'branch_pr') return KYON_TASKS_BRANCH;
  return projectRow.workBranch || defaultBranch;
}

export function parsePlanKeywords(projectRow: typeof project.$inferSelect): string[] | undefined {
  if (!projectRow.planHeadings) return undefined;
  try {
    const value: unknown = JSON.parse(projectRow.planHeadings);
    return Array.isArray(value)
      ? value.filter((x): x is string => typeof x === 'string')
      : undefined;
  } catch (error) {
    console.warn('Invalid plan headings', error);
    return undefined;
  }
}

export function parseIgnoreGlobs(projectRow: typeof project.$inferSelect): string[] {
  if (!projectRow.ignoreGlobs) return [];
  try {
    const value: unknown = JSON.parse(projectRow.ignoreGlobs);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch (error) {
    console.warn('Invalid ignore globs', error);
    return [];
  }
}

/** The .md files chosen as checklists; null while the project has not chosen yet. */
export function parseChecklistFiles(projectRow: typeof project.$inferSelect): string[] | null {
  if (!projectRow.checklistFiles) return null;
  try {
    const value: unknown = JSON.parse(projectRow.checklistFiles);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : null;
  } catch (error) {
    console.warn('Invalid checklist files', error);
    return null;
  }
}
