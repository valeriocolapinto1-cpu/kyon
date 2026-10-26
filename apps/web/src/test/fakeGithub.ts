import { Hono } from 'hono';

/**
 * In-memory fake of the parts of GitHub Kyon uses: OAuth for GitHub Apps (with a consent page),
 * user, installations and repositories. Later phases extend it (contents, commits, PRs, checks).
 * Used by integration tests (through a fetch stub) and by e2e (as a local HTTP server).
 */

export interface FakeRepo {
  id: number;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  installationId: number;
}

export interface FakeUser {
  id: number;
  login: string;
  /** Repo ids this user can access (through any installation). */
  repoIds: number[];
}

export interface FakeState {
  users: FakeUser[];
  repos: FakeRepo[];
  /** token → login */
  accessTokens: Map<string, { login: string; expiresAt: number }>;
  refreshTokens: Map<string, string>;
  codes: Map<string, string>;
  accessTokenTtlSeconds: number;
  counter: number;
  /** Where the "Install" page sends the user back (the app's Setup URL). */
  kyonOrigin: string;
  requests: { method: string; path: string }[];
}

export function defaultFakeState(kyonOrigin = 'http://localhost:8787'): FakeState {
  return {
    users: [
      { id: 1001, login: 'valerio-gh', repoIds: [9001, 9002] },
      { id: 1002, login: 'christian-gh', repoIds: [9001, 9003] },
    ],
    repos: [
      { id: 9001, owner: 'cerbero', name: 'allenamento', private: true, defaultBranch: 'main', installationId: 501 },
      { id: 9002, owner: 'valerio-gh', name: 'sito-personale', private: false, defaultBranch: 'main', installationId: 501 },
      { id: 9003, owner: 'christian-gh', name: 'dotfiles', private: true, defaultBranch: 'master', installationId: 502 },
    ],
    accessTokens: new Map(),
    refreshTokens: new Map(),
    codes: new Map(),
    accessTokenTtlSeconds: 8 * 60 * 60,
    counter: 0,
    kyonOrigin,
    requests: [],
  };
}

function repoJson(repo: FakeRepo, base: string) {
  return {
    id: repo.id,
    name: repo.name,
    full_name: `${repo.owner}/${repo.name}`,
    owner: { login: repo.owner },
    private: repo.private,
    default_branch: repo.defaultBranch,
    html_url: `${base}/${repo.owner}/${repo.name}`,
  };
}

const page = (body: string) =>
  `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Fake GitHub</title></head><body style="font-family:system-ui;padding:2rem">${body}</body></html>`;

export function createFakeGitHub(state: FakeState = defaultFakeState()) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    state.requests.push({ method: c.req.method, path: new URL(c.req.url).pathname });
    await next();
  });

  const issueTokens = (login: string) => {
    state.counter += 1;
    const access = `fake_at_${login}_${state.counter}`;
    const refresh = `fake_rt_${login}_${state.counter}`;
    state.accessTokens.set(access, { login, expiresAt: Date.now() + state.accessTokenTtlSeconds * 1000 });
    state.refreshTokens.set(refresh, login);
    return {
      access_token: access,
      expires_in: state.accessTokenTtlSeconds,
      refresh_token: refresh,
      refresh_token_expires_in: 15_811_200,
      token_type: 'bearer',
      scope: '',
    };
  };

  const currentUser = (authorization: string | undefined) => {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const entry = state.accessTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return state.users.find((u) => u.login === entry.login) ?? null;
  };

  // ---- OAuth (GitHub App user authorization) ----

  app.get('/login/oauth/authorize', (c) => {
    const { redirect_uri: redirectUri = '', state: oauthState = '' } = c.req.query();
    const buttons = state.users
      .map((u) => {
        const q = new URLSearchParams({ login: u.login, redirect_uri: redirectUri, state: oauthState });
        return `<p><a href="/login/oauth/authorize/approve?${q}">Autorizza come ${u.login}</a></p>`;
      })
      .join('');
    return c.html(page(`<h1>Autorizza Kyon</h1>${buttons}`));
  });

  app.get('/login/oauth/authorize/approve', (c) => {
    const { login = '', redirect_uri: redirectUri = '', state: oauthState = '' } = c.req.query();
    const code = `code_${login}_${++state.counter}`;
    state.codes.set(code, login);
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', oauthState);
    return c.redirect(target.toString(), 302);
  });

  app.post('/login/oauth/access_token', async (c) => {
    const body = (await c.req.json()) as { code?: string; grant_type?: string; refresh_token?: string; client_id?: string };
    if (!body.client_id) return c.json({ error: 'incorrect_client_credentials' }, 401);
    if (body.grant_type === 'refresh_token') {
      const login = state.refreshTokens.get(body.refresh_token ?? '');
      if (!login) return c.json({ error: 'bad_refresh_token' }, 400);
      state.refreshTokens.delete(body.refresh_token ?? '');
      return c.json(issueTokens(login));
    }
    const login = state.codes.get(body.code ?? '');
    if (!login) return c.json({ error: 'bad_verification_code' }, 400);
    state.codes.delete(body.code ?? '');
    return c.json(issueTokens(login));
  });

  // ---- App installation page (redirects to the app's Setup URL) ----

  app.get('/apps/:slug/installations/new', (c) =>
    c.html(page(`<h1>Installa ${c.req.param('slug')}</h1><p><a href="/__fake/installed">Installa</a></p>`)),
  );
  app.get('/__fake/installed', (c) => c.redirect(`${state.kyonOrigin}/api/github/setup?installation_id=501&setup_action=install`, 302));

  // ---- REST API ----

  app.get('/user', (c) => {
    const u = currentUser(c.req.header('authorization'));
    if (!u) return c.json({ message: 'Bad credentials' }, 401);
    return c.json({ id: u.id, login: u.login, avatar_url: null });
  });

  app.get('/user/installations', (c) => {
    const u = currentUser(c.req.header('authorization'));
    if (!u) return c.json({ message: 'Bad credentials' }, 401);
    const ids = [...new Set(state.repos.filter((r) => u.repoIds.includes(r.id)).map((r) => r.installationId))];
    return c.json({ total_count: ids.length, installations: ids.map((id) => ({ id, account: { login: 'cerbero' } })) });
  });

  app.get('/user/installations/:id/repositories', (c) => {
    const u = currentUser(c.req.header('authorization'));
    if (!u) return c.json({ message: 'Bad credentials' }, 401);
    const installationId = Number(c.req.param('id'));
    const base = new URL(c.req.url).origin;
    const repos = state.repos.filter((r) => r.installationId === installationId && u.repoIds.includes(r.id));
    return c.json({ total_count: repos.length, repositories: repos.map((r) => repoJson(r, base)) });
  });

  // ---- Test controls ----

  app.post('/__fake/reset', (c) => {
    Object.assign(state, defaultFakeState(state.kyonOrigin));
    return c.json({ ok: true });
  });

  app.post('/__fake/config', async (c) => {
    const body = (await c.req.json()) as Partial<Pick<FakeState, 'accessTokenTtlSeconds' | 'kyonOrigin'>>;
    Object.assign(state, body);
    return c.json({ ok: true });
  });

  app.post('/__fake/repos/:id/remove-access', async (c) => {
    const id = Number(c.req.param('id'));
    const { login } = (await c.req.json()) as { login: string };
    const u = state.users.find((x) => x.login === login);
    if (u) u.repoIds = u.repoIds.filter((r) => r !== id);
    return c.json({ ok: true });
  });

  return { app, state };
}

/**
 * Replaces global fetch so requests to `baseUrl` reach the fake (integration tests).
 * Returns a restore function.
 */
export function installFakeFetch(fake: ReturnType<typeof createFakeGitHub>, baseUrl = 'http://fake-github.test'): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.startsWith(baseUrl)) return fake.app.fetch(request);
    return original(request);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
