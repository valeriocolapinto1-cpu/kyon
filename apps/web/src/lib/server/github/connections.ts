import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '@kyon/core';
import type { Db } from '@/db/client';
import { githubConnection } from '@/db/schema';
import { ApiError } from '../errors';
import { gh, refreshAccessToken, type GitHubConfig, type TokenSet } from './client';

/** Refresh a bit before expiry so a long request doesn't race the deadline. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function encryptionKey(env: CloudflareEnv): string {
  if (!env.TOKEN_ENCRYPTION_KEY)
    throw new ApiError('internal', 'Chiave di cifratura dei token mancante.');
  return env.TOKEN_ENCRYPTION_KEY;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url?: string;
}

export async function saveConnection(
  db: Db,
  env: CloudflareEnv,
  userId: string,
  tokens: TokenSet,
  ghUser: GitHubUser,
) {
  const key = encryptionKey(env);
  const now = new Date();
  const values = {
    userId,
    githubUserId: ghUser.id,
    login: ghUser.login,
    avatarUrl: ghUser.avatar_url ?? null,
    accessToken: await encryptSecret(key, tokens.accessToken, `gh-access:${userId}`),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken
      ? await encryptSecret(key, tokens.refreshToken, `gh-refresh:${userId}`)
      : null,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    lastError: null,
    updatedAt: now,
  };
  await db
    .insert(githubConnection)
    .values({ ...values, createdAt: now })
    .onConflictDoUpdate({ target: githubConnection.userId, set: values });
}

export async function getConnection(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(githubConnection)
    .where(eq(githubConnection.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Returns a valid user access token, refreshing it (and persisting the new pair) when needed.
 * Returns null when the user hasn't connected GitHub or the refresh token has expired.
 */
export async function getAccessToken(
  db: Db,
  env: CloudflareEnv,
  config: GitHubConfig,
  userId: string,
): Promise<string | null> {
  const row = await getConnection(db, userId);
  if (!row) return null;
  const key = encryptionKey(env);
  const now = Date.now();
  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? Infinity;
  if (expiresAt - REFRESH_MARGIN_MS > now) {
    return decryptSecret(key, row.accessToken, `gh-access:${userId}`);
  }
  if (
    !row.refreshToken ||
    (row.refreshTokenExpiresAt && row.refreshTokenExpiresAt.getTime() <= now)
  ) {
    await db
      .update(githubConnection)
      .set({ lastError: 'refresh_expired', updatedAt: new Date() })
      .where(eq(githubConnection.userId, userId));
    return null;
  }
  const refreshToken = await decryptSecret(key, row.refreshToken, `gh-refresh:${userId}`);
  const tokens = await refreshAccessToken(config, refreshToken);
  const ghUser = { id: row.githubUserId, login: row.login, avatar_url: row.avatarUrl ?? undefined };
  await saveConnection(db, env, userId, tokens, ghUser);
  return tokens.accessToken;
}

export function fetchGitHubUser(config: GitHubConfig, token: string) {
  return gh<GitHubUser>(config, token, 'GET', '/user').then((r) => r.data);
}

export async function deleteConnection(db: Db, userId: string) {
  await db.delete(githubConnection).where(eq(githubConnection.userId, userId));
}
