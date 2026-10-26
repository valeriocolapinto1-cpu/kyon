import { and, desc, eq, inArray } from 'drizzle-orm';
import { ciState, claudeMdFor, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { activityEvent, taskFile, user } from '@/db/schema';
import { ApiError } from './errors';
import { GitHubError } from './github/client';
import { getFile, putFile } from './github/files';
import { checkRuns, listCommits, listOpenIssues, listPulls } from './github/pulls';
import { authorizeProject } from './projects';
import { parsePlanKeywords, readBranch, repoAccess } from './tasks/access';

const CACHE_SECONDS = 60;

/** Workers' edge cache (free, no write quota). Absent in tests and in `next dev`. */
function edgeCache(): Cache | null {
  const store = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return store?.default ?? null;
}

async function githubStatus(db: Db, env: CloudflareEnv, actor: Actor, projectId: string) {
  const { project: proj } = await authorizeProject(db, actor, projectId, 'project:view');
  const access = await repoAccess(db, env, proj, actor.id);
  const branch = proj.workBranch || access.defaultBranch;
  const [commits, pulls, issues] = await Promise.all([
    listCommits(access.config, access.token, access.ref, branch, 10),
    listPulls(access.config, access.token, access.ref, 'open', 10),
    listOpenIssues(access.config, access.token, access.ref),
  ]);
  const head = commits[0]?.sha;
  // CI of the branch head and of open PRs (at most 5, inside the subrequest budget).
  const [branchChecks, ...pullChecks] = await Promise.all([
    head ? checkRuns(access.config, access.token, access.ref, head) : Promise.resolve([]),
    ...pulls
      .slice(0, 5)
      .map((p) => checkRuns(access.config, access.token, access.ref, p.head.sha).catch(() => [])),
  ]);
  return {
    branch,
    ci: {
      state: ciState(branchChecks),
      checks: branchChecks.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
      })),
    },
    commits: commits.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0] ?? '',
      author: c.author?.login ?? c.commit.author?.name ?? '',
      date: c.commit.author?.date ?? null,
      url: c.html_url,
    })),
    pulls: pulls.map((p, i) => ({
      number: p.number,
      title: p.title,
      author: p.user?.login ?? '',
      url: p.html_url,
      createdAt: p.created_at,
      ci: i < 5 ? ciState(pullChecks[i] ?? []) : null,
    })),
    issues: issues.slice(0, 10).map((i) => ({
      number: i.number,
      title: i.title,
      author: i.user?.login ?? '',
      url: i.html_url,
      createdAt: i.created_at,
    })),
  };
}

/**
 * The Status tab: GitHub (cached for a minute at the edge, per project) plus Kyon's own history
 * (always fresh). `fresh` skips the cache ("Sincronizza ora").
 */
export async function projectStatus(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
  fresh: boolean,
) {
  await authorizeProject(db, actor, projectId, 'project:view');
  const cache = edgeCache();
  const key = new Request(`https://kyon-cache.internal/status/${projectId}`);
  let github: Awaited<ReturnType<typeof githubStatus>> | null = null;
  let githubError: string | null = null;
  const hit = !fresh && cache ? await cache.match(key) : undefined;
  if (hit) github = (await hit.json()) as typeof github;
  else {
    try {
      github = await githubStatus(db, env, actor, projectId);
      if (cache)
        await cache.put(
          key,
          Response.json(github, { headers: { 'cache-control': `max-age=${CACHE_SECONDS}` } }),
        );
    } catch (error) {
      if (!(error instanceof GitHubError) && !(error instanceof ApiError)) throw error;
      githubError = error.message;
    }
  }

  const events = await db
    .select({ event: activityEvent, actorName: user.name })
    .from(activityEvent)
    .leftJoin(user, eq(user.id, activityEvent.actorId))
    .where(eq(activityEvent.projectId, projectId))
    .orderBy(desc(activityEvent.createdAt))
    .limit(40);
  const completed = await db
    .select({ event: activityEvent, actorName: user.name })
    .from(activityEvent)
    .leftJoin(user, eq(user.id, activityEvent.actorId))
    .where(
      and(eq(activityEvent.projectId, projectId), inArray(activityEvent.type, ['task_completed'])),
    )
    .orderBy(desc(activityEvent.createdAt))
    .limit(10);
  const view = ({ event, actorName }: (typeof events)[number]) => ({
    id: event.id,
    type: event.type,
    payload: JSON.parse(event.payload) as Record<string, unknown>,
    createdAt: event.createdAt.toISOString(),
    actor: event.actorId ? { id: event.actorId, name: actorName ?? '' } : null,
  });
  return {
    github,
    githubError,
    completed: completed.map(view),
    history: events.map(view),
  };
}

async function claudeMdInput(db: Db, env: CloudflareEnv, actor: Actor, projectId: string) {
  const { project: proj } = await authorizeProject(db, actor, projectId, 'project:view');
  const access = await repoAccess(db, env, proj, actor.id);
  const files = await db
    .select({ path: taskFile.path })
    .from(taskFile)
    .where(and(eq(taskFile.projectId, projectId), eq(taskFile.kind, 'tasks')))
    .orderBy(taskFile.path);
  return {
    proj,
    access,
    input: {
      project: proj.name,
      repo: `${access.ref.owner}/${access.ref.repo}`,
      defaultBranch: access.defaultBranch,
      workBranch: proj.workBranch,
      commitMode: proj.commitMode as 'direct' | 'branch_pr',
      taskFiles: files.map((f) => f.path),
      planHeadings: parsePlanKeywords(proj) ?? ['Prossimi passi', 'TODO', 'Da fare'],
    },
  };
}

async function hasClaudeMd(access: Awaited<ReturnType<typeof repoAccess>>, branch: string) {
  return getFile(access.config, access.token, access.ref, 'CLAUDE.md', branch).then(
    () => true,
    (error: unknown) => {
      if (error instanceof GitHubError && error.status === 404) return false;
      throw error;
    },
  );
}

/** "Genera CLAUDE.md": preview only, plus whether the repo already has one. */
export async function previewClaudeMd(db: Db, env: CloudflareEnv, actor: Actor, projectId: string) {
  const { proj, access, input } = await claudeMdInput(db, env, actor, projectId);
  const exists = await hasClaudeMd(access, readBranch(proj, access.defaultBranch));
  return { markdown: claudeMdFor(input), exists };
}

/** Writes CLAUDE.md to the repo: only after an explicit confirmation in the UI, never overwriting. */
export async function writeClaudeMd(db: Db, env: CloudflareEnv, actor: Actor, projectId: string) {
  const { proj, access, input } = await claudeMdInput(db, env, actor, projectId);
  await authorizeProject(db, actor, projectId, 'project:write_prompt');
  const branch = readBranch(proj, access.defaultBranch);
  if (await hasClaudeMd(access, branch))
    throw new ApiError('conflict', 'La repo ha già un CLAUDE.md: copialo e uniscilo a mano.');
  const trailer = access.coAuthor
    ? `\n\nCo-authored-by: ${access.coAuthor.name} <${access.coAuthor.email}>`
    : '';
  await putFile(access.config, access.token, access.ref, 'CLAUDE.md', {
    content: claudeMdFor(input),
    sha: null,
    branch,
    message: `docs: add CLAUDE.md generated by Kyon${trailer}`,
  });
}
