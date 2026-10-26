import { verifyGitHubSignature } from '@kyon/core';
import { eq } from 'drizzle-orm';
import { githubConnection, project } from '@/db/schema';
import { ApiError } from '../errors';
import { githubConfig } from '../github/client';
import { markInstallationUnavailable, markReposUnavailable, syncRepos } from '../github/repos';
import type { GhPull } from '../github/pulls';
import { handleChecksEvent, handlePullRequestEvent, handlePushMarkers } from '../prompts/runs';
import { syncProject } from '../tasks/sync';
import { json, route } from '../http';

interface InstallationPayload {
  action?: string;
  ref?: string;
  repository?: { id: number };
  installation?: { id: number };
  sender?: { id: number };
  repositories_removed?: { id: number }[];
  repositories?: { id: number }[];
  pull_request?: GhPull;
  check_suite?: { head_sha: string };
  check_run?: { head_sha: string };
  commits?: { message: string }[];
}

/**
 * GitHub App webhook. Unsigned or badly signed payloads are rejected before parsing.
 * Installation changes keep the repo list right; `push` re-reads the changed .md files
 * (incremental: only blobs whose sha changed) and links runs whose commits carry a marker;
 * `pull_request` and `check_*` follow the PRs of prompt runs (link, CI, merge → close task).
 */
export const POST = route(async ({ request, env, db }) => {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new ApiError('not_found');
  const body = new Uint8Array(await request.arrayBuffer());
  if (!(await verifyGitHubSignature(secret, body, request.headers.get('x-hub-signature-256')))) {
    throw new ApiError('unauthorized', 'Firma non valida.');
  }
  const event = request.headers.get('x-github-event') ?? '';
  const payload = JSON.parse(new TextDecoder().decode(body)) as InstallationPayload;

  if (
    event === 'installation' &&
    (payload.action === 'deleted' || payload.action === 'suspend') &&
    payload.installation
  ) {
    await markInstallationUnavailable(db, payload.installation.id);
  } else if (event === 'installation_repositories' && payload.repositories_removed?.length) {
    await markReposUnavailable(
      db,
      payload.repositories_removed.map((r) => r.id),
    );
  }
  // New repos or a new installation: refresh the list of whoever made the change, if connected.
  if (
    (event === 'installation' && payload.action === 'created') ||
    (event === 'installation_repositories' && payload.action === 'added')
  ) {
    const senderId = payload.sender?.id;
    if (senderId) {
      const [connection] = await db
        .select()
        .from(githubConnection)
        .where(eq(githubConnection.githubUserId, senderId))
        .limit(1);
      if (connection) {
        try {
          await syncRepos(db, env, githubConfig(env), connection.userId);
        } catch (error) {
          console.warn('Webhook repo sync failed', error);
        }
      }
    }
  }
  // Failures are logged, not returned: GitHub would redeliver forever and "Verifica stato PR"
  // or the cron realign later.
  const repoId = payload.repository?.id;
  try {
    if (event === 'pull_request' && repoId && payload.pull_request)
      await handlePullRequestEvent(db, env, repoId, payload.pull_request);
    const sha = payload.check_suite?.head_sha ?? payload.check_run?.head_sha;
    if ((event === 'check_suite' || event === 'check_run') && repoId && sha)
      await handleChecksEvent(db, env, repoId, sha);
    if (
      event === 'push' &&
      repoId &&
      payload.ref?.startsWith('refs/heads/') &&
      payload.commits?.length
    )
      await handlePushMarkers(
        db,
        env,
        repoId,
        payload.ref.slice('refs/heads/'.length),
        payload.commits.map((c) => c.message),
      );
  } catch (error) {
    console.warn(`Webhook ${event} for runs failed`, error);
  }
  if (event === 'push' && payload.repository) {
    const [proj] = await db
      .select()
      .from(project)
      .where(eq(project.githubRepoId, payload.repository.id))
      .limit(1);
    if (proj && !proj.archivedAt) {
      try {
        await syncProject(db, env, proj.id);
      } catch (error) {
        // The cron will retry; GitHub shouldn't redeliver forever.
        console.warn('Webhook push sync failed', error);
      }
    }
  }
  return json({ ok: true, event });
});
