import { z } from 'zod';
import { ApiError } from '../errors';
import { authorizeUrl, exchangeCode, githubConfig, githubConfigured, installUrl } from '../github/client';
import { deleteConnection, fetchGitHubUser, getConnection, saveConnection } from '../github/connections';
import { listVisibleRepos, syncRepos } from '../github/repos';
import { authedRoute, json, rateLimit } from '../http';

const STATE_COOKIE = 'kyon_gh_state';

/** GET /api/github → connection status and the links the Settings page needs. */
export const GET = authedRoute(async ({ env, db, auth }) => {
  const config = githubConfig(env);
  const connection = await getConnection(db, auth.user.id);
  return json({
    configured: githubConfigured(config),
    installUrl: githubConfigured(config) ? installUrl(config) : null,
    connection: connection
      ? {
          login: connection.login,
          avatarUrl: connection.avatarUrl,
          lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
          needsReconnect: connection.lastError === 'refresh_expired',
        }
      : null,
  });
});

/** DELETE /api/github → disconnects (tokens deleted; repos kept but marked unavailable). */
export const DELETE = authedRoute(async ({ db, auth }) => {
  await deleteConnection(db, auth.user.id);
  return json({ ok: true });
});

export const connect = authedRoute(async ({ request, env }) => {
  const config = githubConfig(env);
  if (!githubConfigured(config)) throw new ApiError('bad_request', 'La GitHub App non è ancora configurata (vedi docs/SETUP.md).');
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const secure = origin.startsWith('https://') ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl(config, `${origin}/api/github/callback`, state),
      'set-cookie': `${STATE_COOKIE}=${state}; Path=/api/github; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
});

function readCookie(request: Request, name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get('cookie') ?? '');
  return match?.[1] ?? null;
}

function redirectToSettings(origin: string, status: string) {
  return new Response(null, {
    status: 302,
    headers: { location: `${origin}/settings?github=${status}#github`, 'set-cookie': `${STATE_COOKIE}=; Path=/api/github; Max-Age=0` },
  });
}

/** OAuth callback: checks the state, stores encrypted tokens, syncs repos. */
export const callback = authedRoute(async ({ request, env, db, auth }) => {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const expected = readCookie(request, STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) return redirectToSettings(url.origin, 'error');
  const config = githubConfig(env);
  const tokens = await exchangeCode(config, code, `${url.origin}/api/github/callback`);
  const ghUser = await fetchGitHubUser(config, tokens.accessToken);
  await saveConnection(db, env, auth.user.id, tokens, ghUser);
  try {
    await syncRepos(db, env, config, auth.user.id);
  } catch (error) {
    console.warn('Repo sync after connect failed', error);
  }
  return redirectToSettings(url.origin, 'connected');
});

/** "Setup URL" of the GitHub App: GitHub sends the user here after installing on new repos. */
export const setup = authedRoute(async ({ request, env, db, auth }) => {
  const origin = new URL(request.url).origin;
  if (await getConnection(db, auth.user.id)) {
    try {
      await syncRepos(db, env, githubConfig(env), auth.user.id);
    } catch (error) {
      console.warn('Repo sync after install failed', error);
    }
  }
  return redirectToSettings(origin, 'installed');
});

/** POST /api/github/sync → refreshes the repo list from GitHub. */
export const sync = authedRoute(async ({ env, db, auth, actor }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${auth.user.id}`);
  await syncRepos(db, env, githubConfig(env), auth.user.id);
  return json({ repos: await listVisibleRepos(db, actor) });
});

export const parseExposure = z.object({
  exposure: z.enum(['hidden', 'self', 'selected', 'group']),
  sharedWith: z.array(z.string().max(64)).max(20).default([]),
});
