import { eq } from 'drizzle-orm';
import { classifyPath, parseTasks } from '@kyon/core';
import type { Db } from '@/db/client';
import { project, projectSync, taskFile } from '@/db/schema';
import { ApiError } from '../errors';
import { GitHubError } from '../github/client';
import { getFile, getTree } from '../github/files';
import { parseIgnoreGlobs, parsePlanKeywords, readBranch, repoAccess } from './access';
import { applyParsedFile, removeFile } from './apply';

/**
 * Workers on the Free plan get 50 subrequests per request: one goes to the tree, the rest to
 * changed files. Files over budget are remembered in `pending` and fetched on the next sync.
 */
const MAX_FILES_PER_SYNC = 30;

export interface SyncResult {
  unchanged: boolean;
  fetched: number;
  removed: number;
  pending: number;
}

function parsePending(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function syncProject(
  db: Db,
  env: CloudflareEnv,
  projectId: string,
  actorId: string | null = null,
): Promise<SyncResult> {
  const [row] = await db.select().from(project).where(eq(project.id, projectId)).limit(1);
  if (!row) throw new ApiError('not_found');
  const access = await repoAccess(db, env, row, actorId);
  const [state] = await db
    .select()
    .from(projectSync)
    .where(eq(projectSync.projectId, projectId))
    .limit(1);
  let branch = readBranch(row, access.defaultBranch);
  const pendingBefore = parsePending(state?.pending ?? null);
  const now = new Date();

  try {
    let tree;
    try {
      tree = await getTree(
        access.config,
        access.token,
        access.ref,
        branch,
        state?.branch === branch && pendingBefore.length === 0 ? (state?.treeEtag ?? null) : null,
      );
    } catch (error) {
      // "Branch + PR" mode before the first Kyon commit: read the default branch.
      if (error instanceof GitHubError && error.status === 404 && branch !== access.defaultBranch) {
        branch = access.defaultBranch;
        tree = await getTree(access.config, access.token, access.ref, branch, null);
      } else {
        throw error;
      }
    }
    if (!tree) {
      await db
        .update(projectSync)
        .set({ lastSyncAt: now, lastError: null })
        .where(eq(projectSync.projectId, projectId));
      return { unchanged: true, fetched: 0, removed: 0, pending: 0 };
    }

    const ignore = parseIgnoreGlobs(row);
    const wanted = tree.blobs
      .map((b) => ({ ...b, kind: classifyPath(b.path, ignore) }))
      .filter((b) => b.kind === 'tasks' || (b.kind === 'archive' && row.showArchive));
    const existing = await db
      .select({ path: taskFile.path, blobSha: taskFile.blobSha })
      .from(taskFile)
      .where(eq(taskFile.projectId, projectId));
    const known = new Map(existing.map((f) => [f.path, f.blobSha]));
    const changed = wanted.filter((b) => known.get(b.path) !== b.sha);
    const toFetch = changed.slice(0, MAX_FILES_PER_SYNC);
    const pending = changed.slice(MAX_FILES_PER_SYNC).map((b) => b.path);
    const keywords = parsePlanKeywords(row);

    for (const blob of toFetch) {
      const file = await getFile(access.config, access.token, access.ref, blob.path, branch);
      await applyParsedFile(
        db,
        projectId,
        parseTasks(blob.path, file.content, { planKeywords: keywords }),
        file.sha,
        blob.kind === 'archive' ? 'archive' : 'tasks',
        null,
        now,
      );
    }
    const present = new Set(wanted.map((b) => b.path));
    const removed = existing.filter((f) => !present.has(f.path));
    for (const f of removed) await removeFile(db, projectId, f.path, now);

    const values = {
      branch,
      treeSha: tree.sha,
      // Keep the ETag only when everything was fetched: otherwise the next call must re-list.
      treeEtag: pending.length ? null : tree.etag,
      pending: JSON.stringify(pending),
      lastSyncAt: now,
      lastError: tree.truncated ? 'tree_truncated' : null,
    };
    await db
      .insert(projectSync)
      .values({ projectId, ...values })
      .onConflictDoUpdate({ target: projectSync.projectId, set: values });
    return {
      unchanged: false,
      fetched: toFetch.length,
      removed: removed.length,
      pending: pending.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : 'sync_failed';
    await db
      .insert(projectSync)
      .values({ projectId, lastError: message, lastSyncAt: now })
      .onConflictDoUpdate({
        target: projectSync.projectId,
        set: { lastError: message, lastSyncAt: now },
      });
    throw error;
  }
}
