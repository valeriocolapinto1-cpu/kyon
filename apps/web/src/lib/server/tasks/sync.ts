import { eq } from 'drizzle-orm';
import { classifyPath, parseTasks } from '@kyon/core';
import type { Db } from '@/db/client';
import { project, projectSync, taskFile } from '@/db/schema';
import { ApiError } from '../errors';
import { publishTasks } from '../realtime';
import { GitHubError } from '../github/client';
import { FileUnreadableError, getFile, getTree } from '../github/files';
import {
  parseChecklistFiles,
  parseIgnoreGlobs,
  parsePlanKeywords,
  readBranch,
  repoAccess,
} from './access';
import { applyParsedFile, removeFile } from './apply';

/**
 * Workers on the Free plan get 50 subrequests per request: one goes to the tree, the rest to
 * changed files. Files over budget are remembered in `pending` and fetched on the next sync.
 */
const MAX_FILES_PER_SYNC = 30;
/** Longest CLAUDE.md kept for the prompt window (characters). */
export const CLAUDE_MD_MAX = 30_000;

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
        state?.branch === branch && pendingBefore.length === 0 && state.claudeMdSha !== null
          ? (state.treeEtag ?? null)
          : null,
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
    // Only the files the project chose as checklists are read; until it chooses, none is.
    const selection = parseChecklistFiles(row);
    const selected = new Set(selection ?? []);
    const wanted = tree.blobs
      .map((b) => ({ ...b, kind: classifyPath(b.path, ignore) }))
      .filter((b) => b.kind !== 'ignored' && selected.has(b.path));
    const existing = await db
      .select({ path: taskFile.path, blobSha: taskFile.blobSha })
      .from(taskFile)
      .where(eq(taskFile.projectId, projectId));
    const known = new Map(existing.map((f) => [f.path, f.blobSha]));
    const changed = wanted.filter((b) => known.get(b.path) !== b.sha);
    const toFetch = changed.slice(0, MAX_FILES_PER_SYNC);
    const pending = changed.slice(MAX_FILES_PER_SYNC).map((b) => b.path);
    const keywords = parsePlanKeywords(row);

    // Files whose content can't be read are skipped, keeping their last snapshot: an unreadable
    // file must never look like a file without tasks.
    const unreadable: string[] = [];
    for (const blob of toFetch) {
      let file;
      try {
        file = await getFile(access.config, access.token, access.ref, blob.path, branch);
      } catch (error) {
        if (!(error instanceof FileUnreadableError)) throw error;
        unreadable.push(blob.path);
        continue;
      }
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
    // A truncated tree lacks files: absence proves nothing, so nothing is removed. Neither is
    // anything while the project has not chosen its files yet (its tasks are just hidden).
    const removed =
      tree.truncated || selection === null ? [] : existing.filter((f) => !present.has(f.path));
    for (const f of removed) await removeFile(db, projectId, f.path, now);

    // The repo's CLAUDE.md is read along (one more request, only when it changed): sha '' means
    // "looked, there is none", null means "never looked".
    const claudeBlob = tree.blobs.find((b) => b.path === 'CLAUDE.md');
    let claudeMd: { claudeMdSha: string; claudeMd: string | null } | null = null;
    if (
      (claudeBlob?.sha ?? '') !== (state?.claudeMdSha ?? null) &&
      (claudeBlob || !tree.truncated)
    ) {
      if (!claudeBlob) claudeMd = { claudeMdSha: '', claudeMd: null };
      else
        try {
          const file = await getFile(access.config, access.token, access.ref, 'CLAUDE.md', branch);
          claudeMd = {
            claudeMdSha: claudeBlob.sha,
            claudeMd: file.content.slice(0, CLAUDE_MD_MAX),
          };
        } catch (error) {
          if (!(error instanceof FileUnreadableError)) throw error;
          claudeMd = { claudeMdSha: claudeBlob.sha, claudeMd: null };
        }
    }

    const values = {
      ...claudeMd,
      branch,
      treeSha: tree.sha,
      // Keep the ETag only when everything was fetched: otherwise the next call must re-list.
      treeEtag: pending.length ? null : tree.etag,
      pending: JSON.stringify(pending),
      lastSyncAt: now,
      lastError: tree.truncated
        ? 'tree_truncated'
        : unreadable.length
          ? `file_unreadable:${unreadable[0]}`
          : null,
    };
    await db
      .insert(projectSync)
      .values({ projectId, ...values })
      .onConflictDoUpdate({ target: projectSync.projectId, set: values });
    if (toFetch.length || removed.length) await publishTasks(env, projectId, actorId);
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
