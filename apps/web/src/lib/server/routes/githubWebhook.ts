import { verifyGitHubSignature } from '@kyon/core';
import { eq } from 'drizzle-orm';
import { githubConnection } from '@/db/schema';
import { ApiError } from '../errors';
import { githubConfig } from '../github/client';
import { markInstallationUnavailable, markReposUnavailable, syncRepos } from '../github/repos';
import { json, route } from '../http';

interface InstallationPayload {
  action?: string;
  installation?: { id: number };
  sender?: { id: number };
  repositories_removed?: { id: number }[];
  repositories?: { id: number }[];
}

/**
 * GitHub App webhook. Unsigned or badly signed payloads are rejected before parsing.
 * Phase 3 handles installation changes; push / pull_request / check_* arrive in later phases.
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
  return json({ ok: true, event });
});
