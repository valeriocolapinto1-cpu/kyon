import { and, eq, sql } from 'drizzle-orm';
import { can, parsePreviewTarget, type Actor, type PreviewTarget } from '@kyon/core';
import type { Db } from '@/db/client';
import { githubRepo, project, projectMember, taskMeta } from '@/db/schema';
import { ApiError } from '../errors';
import { gh, githubConfig } from '../github/client';
import { getAccessToken } from '../github/connections';
import { repoResource, sharesFor } from '../github/repos';

export interface LinkPreview {
  kind: PreviewTarget['kind'];
  url: string;
  title: string;
  subtitle: string;
  state: string | null;
}

function edgeCache(): Cache | null {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

async function githubPreview(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  target: Extract<PreviewTarget, { owner: string }>,
) {
  const fullName = `${target.owner}/${target.repo}`;
  const rows = await db
    .select()
    .from(githubRepo)
    .where(
      and(sql`lower(${githubRepo.fullName}) = lower(${fullName})`, eq(githubRepo.available, true)),
    );
  const shares = await sharesFor(
    db,
    rows.map((r) => r.id),
  );
  // Only repos the actor may see: a hidden repo never leaks a title.
  const visible = rows.find((r) =>
    can(actor, 'repo:view', repoResource(r, shares.get(r.id) ?? [])),
  );
  if (!visible) return null;
  const config = githubConfig(env);
  const token = await getAccessToken(db, env, config, visible.userId);
  if (!token) return null;
  const cache = edgeCache();
  const key = new Request(
    `https://kyon-cache.internal/preview?u=${encodeURIComponent(target.url)}`,
  );
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return (await hit.json()) as LinkPreview;
  const base = `/repos/${visible.ownerLogin}/${visible.name}`;
  let preview: LinkPreview;
  if (target.kind === 'github_commit') {
    const { data } = await gh<{ commit: { message: string; author: { name: string } | null } }>(
      config,
      token,
      'GET',
      `${base}/commits/${target.sha}`,
    );
    preview = {
      kind: target.kind,
      url: target.url,
      title: data.commit.message.split('\n')[0] ?? '',
      subtitle: `${visible.fullName} · ${target.sha.slice(0, 7)}${data.commit.author ? ` · ${data.commit.author.name}` : ''}`,
      state: null,
    };
  } else {
    const { data } = await gh<{
      title: string;
      state: string;
      merged_at?: string | null;
      pull_request?: { merged_at: string | null };
    }>(
      config,
      token,
      'GET',
      `${base}/${target.kind === 'github_pull' ? 'pulls' : 'issues'}/${target.number}`,
    );
    const merged = Boolean(data.merged_at ?? data.pull_request?.merged_at);
    preview = {
      kind: target.kind,
      url: target.url,
      title: data.title,
      subtitle: `${visible.fullName} #${target.number}`,
      state: merged ? 'merged' : data.state,
    };
  }
  if (cache)
    await cache.put(key, Response.json(preview, { headers: { 'cache-control': 'max-age=300' } }));
  return preview;
}

async function kyonPreview(
  db: Db,
  actor: Actor,
  target: Extract<PreviewTarget, { kind: 'kyon_project' }>,
) {
  const [row] = await db
    .select({ name: project.name, role: projectMember.role })
    .from(project)
    .innerJoin(
      projectMember,
      and(eq(projectMember.projectId, project.id), eq(projectMember.userId, actor.id)),
    )
    .where(eq(project.id, target.projectId))
    .limit(1);
  if (!row) return null;
  const [task] = target.taskId
    ? await db
        .select({ text: taskMeta.text, done: taskMeta.done })
        .from(taskMeta)
        .where(and(eq(taskMeta.id, target.taskId), eq(taskMeta.projectId, target.projectId)))
        .limit(1)
    : [];
  return {
    kind: target.kind,
    url: target.url,
    title: task?.text ?? row.name,
    subtitle: task ? `Task di ${row.name}` : 'Progetto Kyon',
    state: task ? (task.done ? 'done' : 'open') : null,
  } satisfies LinkPreview;
}

/**
 * A preview for one link of a message: GitHub PR/issue/commit of a repo the actor can see, or a
 * Kyon project/task they're a member of. Any other URL is refused (no fetch of arbitrary URLs).
 */
export async function linkPreview(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  url: string,
  origin: string,
) {
  const target = parsePreviewTarget(url, origin);
  if (!target) throw new ApiError('bad_request', 'Anteprima disponibile solo per GitHub e Kyon.');
  const preview =
    target.kind === 'kyon_project'
      ? await kyonPreview(db, actor, target)
      : await githubPreview(db, env, actor, target).catch((error: unknown) => {
          console.warn('preview failed', error);
          return null;
        });
  return preview;
}
