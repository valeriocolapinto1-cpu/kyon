import { and, count, eq, isNull } from 'drizzle-orm';
import { classifyPath, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { taskMeta } from '@/db/schema';
import { GitHubError } from '../github/client';
import { getTree } from '../github/files';
import { authorizeProject } from '../projects';
import { parseChecklistFiles, parseIgnoreGlobs, readBranch, repoAccess } from './access';

export interface MarkdownFile {
  path: string;
  kind: 'tasks' | 'archive';
  /** Tasks Kyon already read from it (0 when it was never read). */
  tasks: number;
}

/**
 * Every .md file of the repo that could be a checklist, for the "File checklist" picker, with the
 * tasks already read from each and the current choice (null = not chosen yet).
 */
export async function listMarkdownFiles(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  projectId: string,
) {
  const { project: row } = await authorizeProject(db, actor, projectId, 'project:view');
  const access = await repoAccess(db, env, row, actor.id);
  let branch = readBranch(row, access.defaultBranch);
  let tree;
  try {
    tree = await getTree(access.config, access.token, access.ref, branch, null);
  } catch (error) {
    // "Branch + PR" mode before the first Kyon commit: read the default branch.
    if (error instanceof GitHubError && error.status === 404 && branch !== access.defaultBranch) {
      branch = access.defaultBranch;
      tree = await getTree(access.config, access.token, access.ref, branch, null);
    } else {
      throw error;
    }
  }
  const ignore = parseIgnoreGlobs(row);
  const counts = await db
    .select({ path: taskMeta.path, n: count() })
    .from(taskMeta)
    .where(and(eq(taskMeta.projectId, projectId), isNull(taskMeta.orphanedAt)))
    .groupBy(taskMeta.path);
  const known = new Map(counts.map((c) => [c.path, Number(c.n)]));
  const files: MarkdownFile[] = [];
  for (const blob of tree?.blobs ?? []) {
    const kind = classifyPath(blob.path, ignore);
    if (kind === 'ignored') continue;
    files.push({ path: blob.path, kind, tasks: known.get(blob.path) ?? 0 });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    selected: parseChecklistFiles(row),
    truncated: Boolean(tree?.truncated),
  };
}
