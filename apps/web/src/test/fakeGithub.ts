import { Hono } from 'hono';

/**
 * In-memory fake of the parts of GitHub Kyon uses: OAuth for GitHub Apps (with a consent page),
 * user, installations and repositories. Later phases extend it (contents, commits, PRs, checks).
 * Used by integration tests (through a fetch stub) and by e2e (as a local HTTP server).
 */

export interface FakeCommit {
  sha: string;
  message: string;
  branch: string;
  path: string;
  author: string;
}

export interface FakePull {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  state: 'open' | 'closed';
  merged: boolean;
  author?: string;
  headSha?: string;
  createdAt?: string;
  mergedAt?: string | null;
  /** Commit messages on the PR branch. */
  commitMessages?: string[];
}

export interface FakeCheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
}

export interface FakeRepo {
  id: number;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  installationId: number;
  /** branch → path → content */
  branches?: Map<string, Map<string, string>>;
  commits?: FakeCommit[];
  pulls?: FakePull[];
  /** head sha → check runs */
  checks?: Map<string, FakeCheck[]>;
  issues?: { number: number; title: string; author: string; createdAt: string }[];
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
  /** Origin used in html_url links of webhook payloads. */
  webOrigin: string;
  requests: { method: string; path: string }[];
  /** Simulates someone pushing between Kyon's read and write: the next PUTs on `path` fail with 409. */
  conflicts: { path: string; content: string; times: number }[];
  /** Simulates GitHub truncating the recursive tree: only the first half of the entries is listed. */
  truncatedTree: boolean;
  /** Paths served like files over 1 MB: Contents API with empty content and encoding "none". */
  largeFiles: Set<string>;
  /** Paths the blob API refuses too (over 100 MB). */
  hugeFiles: Set<string>;
}

export function defaultFakeState(kyonOrigin = 'http://localhost:8787'): FakeState {
  return {
    users: [
      { id: 1001, login: 'valerio-gh', repoIds: [9001, 9002] },
      { id: 1002, login: 'christian-gh', repoIds: [9001, 9003] },
    ],
    repos: [
      {
        id: 9001,
        owner: 'cerbero',
        name: 'allenamento',
        private: true,
        defaultBranch: 'main',
        installationId: 501,
      },
      {
        id: 9002,
        owner: 'valerio-gh',
        name: 'sito-personale',
        private: false,
        defaultBranch: 'main',
        installationId: 501,
      },
      {
        id: 9003,
        owner: 'christian-gh',
        name: 'dotfiles',
        private: true,
        defaultBranch: 'master',
        installationId: 502,
      },
    ],
    accessTokens: new Map(),
    refreshTokens: new Map(),
    codes: new Map(),
    accessTokenTtlSeconds: 8 * 60 * 60,
    counter: 0,
    kyonOrigin,
    webOrigin: 'http://fake-github.test',
    requests: [],
    conflicts: [],
    truncatedTree: false,
    largeFiles: new Set(),
    hugeFiles: new Set(),
  };
}

/** Git-like content id (deterministic, not real SHA-1). */
export function fakeSha(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x2b992ddf;
  for (let i = 0; i < content.length; i++) {
    h1 = Math.imul(h1 ^ content.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ content.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return (
    (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2) + '00000000'
  );
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function files(repo: FakeRepo, branch: string): Map<string, string> | undefined {
  repo.branches ??= new Map([[repo.defaultBranch, new Map()]]);
  return repo.branches.get(branch);
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

function pullJson(repo: FakeRepo, p: FakePull, base: string) {
  return {
    number: p.number,
    title: p.title,
    body: p.body,
    state: p.state,
    merged: p.merged,
    merged_at: p.mergedAt ?? null,
    created_at: p.createdAt ?? new Date(0).toISOString(),
    updated_at: p.mergedAt ?? p.createdAt ?? new Date(0).toISOString(),
    user: { login: p.author ?? repo.owner },
    head: { ref: p.head, sha: p.headSha ?? fakeSha(`${repo.id}/${p.head}`) },
    base: { ref: p.base },
    html_url: `${base}/${repo.owner}/${repo.name}/pull/${p.number}`,
  };
}

/** What GitHub would POST to the app's webhook for this PR (tests sign and deliver it). */
export function pullWebhook(repo: FakeRepo, p: FakePull, action: string, base: string) {
  return {
    event: 'pull_request',
    payload: {
      action,
      number: p.number,
      pull_request: pullJson(repo, p, base),
      repository: { id: repo.id },
    },
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
    state.accessTokens.set(access, {
      login,
      expiresAt: Date.now() + state.accessTokenTtlSeconds * 1000,
    });
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
        const q = new URLSearchParams({
          login: u.login,
          redirect_uri: redirectUri,
          state: oauthState,
        });
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
    const body = (await c.req.json()) as {
      code?: string;
      grant_type?: string;
      refresh_token?: string;
      client_id?: string;
    };
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
    c.html(
      page(
        `<h1>Installa ${c.req.param('slug')}</h1><p><a href="/__fake/installed">Installa</a></p>`,
      ),
    ),
  );
  app.get('/__fake/installed', (c) =>
    c.redirect(
      `${state.kyonOrigin}/api/github/setup?installation_id=501&setup_action=install`,
      302,
    ),
  );

  // ---- REST API ----

  app.get('/user', (c) => {
    const u = currentUser(c.req.header('authorization'));
    if (!u) return c.json({ message: 'Bad credentials' }, 401);
    return c.json({ id: u.id, login: u.login, avatar_url: null });
  });

  app.get('/user/installations', (c) => {
    const u = currentUser(c.req.header('authorization'));
    if (!u) return c.json({ message: 'Bad credentials' }, 401);
    const ids = [
      ...new Set(state.repos.filter((r) => u.repoIds.includes(r.id)).map((r) => r.installationId)),
    ];
    return c.json({
      total_count: ids.length,
      installations: ids.map((id) => ({ id, account: { login: 'cerbero' } })),
    });
  });

  app.get('/user/installations/:id/repositories', (c) => {
    const u = currentUser(c.req.header('authorization'));
    if (!u) return c.json({ message: 'Bad credentials' }, 401);
    const installationId = Number(c.req.param('id'));
    const base = new URL(c.req.url).origin;
    const repos = state.repos.filter(
      (r) => r.installationId === installationId && u.repoIds.includes(r.id),
    );
    return c.json({ total_count: repos.length, repositories: repos.map((r) => repoJson(r, base)) });
  });

  // ---- Repository contents (trees, files, branches, pulls) ----

  const findRepo = (owner: string, name: string) =>
    state.repos.find((r) => r.owner === owner && r.name === name);
  const authorizedRepo = (c: {
    req: { param: (k: string) => string; header: (k: string) => string | undefined };
  }) => {
    const u = currentUser(c.req.header('authorization'));
    const repo = findRepo(c.req.param('owner'), c.req.param('repo'));
    if (!u || !repo || !u.repoIds.includes(repo.id)) return null;
    return { u, repo };
  };

  app.get('/repos/:owner/:repo/git/trees/:ref', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const map = files(found.repo, c.req.param('ref'));
    if (!map) return c.json({ message: 'Not Found' }, 404);
    const all = [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, content]) => ({ path, type: 'blob', sha: fakeSha(content) }));
    const tree = state.truncatedTree ? all.slice(0, Math.floor(all.length / 2)) : all;
    const sha = fakeSha(JSON.stringify(tree));
    const etag = `"${sha}"`;
    if (c.req.header('if-none-match') === etag) return c.body(null, 304, { etag });
    return c.json({ sha, tree, truncated: state.truncatedTree }, 200, { etag });
  });

  app.get('/repos/:owner/:repo/git/blobs/:sha', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    for (const [, map] of found.repo.branches ?? []) {
      for (const [path, content] of map) {
        if (fakeSha(content) !== c.req.param('sha')) continue;
        if (state.hugeFiles.has(path))
          return c.json({ sha: c.req.param('sha'), encoding: 'none', content: '' });
        return c.json({
          sha: c.req.param('sha'),
          encoding: 'base64',
          content: encodeBase64(content),
        });
      }
    }
    return c.json({ message: 'Not Found' }, 404);
  });

  app.get('/repos/:owner/:repo/contents/:path{.+}', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const ref = c.req.query('ref') ?? found.repo.defaultBranch;
    const content = files(found.repo, ref)?.get(c.req.param('path'));
    if (content === undefined) return c.json({ message: 'Not Found' }, 404);
    if (state.largeFiles.has(c.req.param('path')) || state.hugeFiles.has(c.req.param('path')))
      return c.json({
        type: 'file',
        path: c.req.param('path'),
        sha: fakeSha(content),
        encoding: 'none',
        content: '',
      });
    return c.json({
      type: 'file',
      path: c.req.param('path'),
      sha: fakeSha(content),
      encoding: 'base64',
      content: encodeBase64(content),
    });
  });

  app.put('/repos/:owner/:repo/contents/:path{.+}', async (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const body = (await c.req.json()) as {
      message: string;
      content: string;
      sha?: string;
      branch?: string;
    };
    const branch = body.branch ?? found.repo.defaultBranch;
    const map = files(found.repo, branch);
    if (!map) return c.json({ message: 'Branch not found' }, 404);
    const path = c.req.param('path');
    const conflict = state.conflicts.find((x) => x.path === path && x.times > 0);
    if (conflict) {
      conflict.times -= 1;
      map.set(path, conflict.content);
      return c.json({ message: `${path} does not match ${body.sha}` }, 409);
    }
    const current = map.get(path);
    if (current !== undefined && body.sha !== fakeSha(current)) {
      return c.json({ message: `${path} does not match ${body.sha ?? 'missing sha'}` }, 409);
    }
    if (current === undefined && body.sha)
      return c.json({ message: 'sha given for a new file' }, 422);
    const content = decodeBase64(body.content);
    map.set(path, content);
    const commit = {
      sha: fakeSha(`${Date.now()}${state.counter++}${content}`),
      message: body.message,
      branch,
      path,
      author: found.u.login,
    };
    found.repo.commits = [...(found.repo.commits ?? []), commit];
    return c.json(
      {
        content: { path, sha: fakeSha(content) },
        commit: { sha: commit.sha, message: body.message },
      },
      current === undefined ? 201 : 200,
    );
  });

  app.get('/repos/:owner/:repo/git/ref/heads/:branch{.+}', (c) => {
    const found = authorizedRepo(c);
    if (!found || !files(found.repo, c.req.param('branch')))
      return c.json({ message: 'Not Found' }, 404);
    return c.json({
      ref: `refs/heads/${c.req.param('branch')}`,
      object: { sha: fakeSha(c.req.param('branch')) },
    });
  });

  app.post('/repos/:owner/:repo/git/refs', async (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const { ref } = (await c.req.json()) as { ref: string; sha: string };
    const name = ref.replace(/^refs\/heads\//, '');
    if (files(found.repo, name)) return c.json({ message: 'Reference already exists' }, 422);
    found.repo.branches?.set(name, new Map(files(found.repo, found.repo.defaultBranch)));
    return c.json({ ref, object: { sha: fakeSha(name) } }, 201);
  });

  app.get('/repos/:owner/:repo/pulls', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const head = c.req.query('head')?.split(':').pop();
    const state = c.req.query('state') ?? 'open';
    const pulls = (found.repo.pulls ?? []).filter(
      (p) => (state === 'all' || p.state === state) && (!head || p.head === head),
    );
    const base = new URL(c.req.url).origin;
    return c.json([...pulls].reverse().map((p) => pullJson(found.repo, p, base)));
  });

  app.get('/repos/:owner/:repo/pulls/:number', (c) => {
    const found = authorizedRepo(c);
    const pull = found?.repo.pulls?.find((p) => p.number === Number(c.req.param('number')));
    if (!found || !pull) return c.json({ message: 'Not Found' }, 404);
    return c.json(pullJson(found.repo, pull, new URL(c.req.url).origin));
  });

  app.get('/repos/:owner/:repo/pulls/:number/commits', (c) => {
    const found = authorizedRepo(c);
    const pull = found?.repo.pulls?.find((p) => p.number === Number(c.req.param('number')));
    if (!found || !pull) return c.json({ message: 'Not Found' }, 404);
    return c.json(
      (pull.commitMessages ?? []).map((message, i) => ({
        sha: fakeSha(`${pull.number}/${i}/${message}`),
        commit: { message },
      })),
    );
  });

  app.get('/repos/:owner/:repo/commits/:ref/check-runs', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const runs = found.repo.checks?.get(c.req.param('ref')) ?? [];
    return c.json({ total_count: runs.length, check_runs: runs });
  });

  app.get('/repos/:owner/:repo/commits', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const base = new URL(c.req.url).origin;
    const perPage = Number(c.req.query('per_page') ?? 30);
    return c.json(
      [...(found.repo.commits ?? [])]
        .reverse()
        .slice(0, perPage)
        .map((commit, i) => ({
          sha: commit.sha,
          html_url: `${base}/${found.repo.owner}/${found.repo.name}/commit/${commit.sha}`,
          commit: {
            message: commit.message,
            author: { name: commit.author, date: new Date(Date.now() - i * 60_000).toISOString() },
          },
          author: { login: commit.author },
        })),
    );
  });

  app.get('/repos/:owner/:repo/issues', (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const base = new URL(c.req.url).origin;
    const issues = (found.repo.issues ?? []).map((i) => ({
      number: i.number,
      title: i.title,
      state: 'open',
      user: { login: i.author },
      created_at: i.createdAt,
      html_url: `${base}/${found.repo.owner}/${found.repo.name}/issues/${i.number}`,
    }));
    // Like GitHub, open PRs come back too, marked with `pull_request`.
    const pulls = (found.repo.pulls ?? [])
      .filter((p) => p.state === 'open')
      .map((p) => ({ ...pullJson(found.repo, p, base), pull_request: {} }));
    return c.json([...issues, ...pulls]);
  });

  app.post('/repos/:owner/:repo/pulls', async (c) => {
    const found = authorizedRepo(c);
    if (!found) return c.json({ message: 'Not Found' }, 404);
    const body = (await c.req.json()) as {
      title: string;
      head: string;
      base: string;
      body?: string;
    };
    const pull: FakePull = {
      number: (found.repo.pulls?.length ?? 0) + (found.repo.issues?.length ?? 0) + 1,
      title: body.title,
      body: body.body ?? '',
      head: body.head,
      base: body.base,
      state: 'open',
      merged: false,
      author: found.u.login,
      createdAt: new Date().toISOString(),
    };
    found.repo.pulls = [...(found.repo.pulls ?? []), pull];
    return c.json(
      {
        number: pull.number,
        html_url: `${new URL(c.req.url).origin}/${found.repo.owner}/${found.repo.name}/pull/${pull.number}`,
      },
      201,
    );
  });

  // ---- Test controls ----

  /** Simulates a push made outside Kyon (e.g. someone edits a .md on GitHub). */
  app.post('/__fake/repos/:id/files', async (c) => {
    const repo = state.repos.find((r) => r.id === Number(c.req.param('id')));
    if (!repo) return c.json({ message: 'Not Found' }, 404);
    const body = (await c.req.json()) as {
      path: string;
      content: string | null;
      branch?: string;
      message?: string;
    };
    const branch = body.branch ?? repo.defaultBranch;
    const map = files(repo, branch);
    if (!map) return c.json({ message: 'Branch not found' }, 404);
    if (body.content === null) map.delete(body.path);
    else map.set(body.path, body.content);
    const commit = {
      sha: fakeSha(`${Date.now()}${state.counter++}`),
      message: body.message ?? 'external edit',
      branch,
      path: body.path,
      author: 'external',
    };
    repo.commits = [...(repo.commits ?? []), commit];
    return c.json({ commit });
  });

  /** A PR opened outside Kyon (e.g. by Claude Code). Returns the webhook to deliver. */
  app.post('/__fake/repos/:id/pulls', async (c) => {
    const repo = state.repos.find((r) => r.id === Number(c.req.param('id')));
    if (!repo) return c.json({ message: 'Not Found' }, 404);
    const body = (await c.req.json()) as {
      title: string;
      body?: string;
      head: string;
      base?: string;
      author?: string;
      commits?: string[];
      createdAt?: string;
    };
    const pull: FakePull = {
      number: (repo.pulls?.length ?? 0) + (repo.issues?.length ?? 0) + 1,
      title: body.title,
      body: body.body ?? '',
      head: body.head,
      base: body.base ?? repo.defaultBranch,
      state: 'open',
      merged: false,
      author: body.author ?? repo.owner,
      createdAt: body.createdAt ?? new Date().toISOString(),
      commitMessages: body.commits ?? [],
    };
    pull.headSha = fakeSha(`${repo.id}/${pull.head}/${pull.commitMessages?.length ?? 0}`);
    repo.pulls = [...(repo.pulls ?? []), pull];
    return c.json({
      number: pull.number,
      headSha: pull.headSha,
      webhook: pullWebhook(repo, pull, 'opened', state.webOrigin),
    });
  });

  /** Edits a PR (body, title, new commits) or closes / merges / reopens it. */
  app.post('/__fake/repos/:id/pulls/:number', async (c) => {
    const repo = state.repos.find((r) => r.id === Number(c.req.param('id')));
    const pull = repo?.pulls?.find((p) => p.number === Number(c.req.param('number')));
    if (!repo || !pull) return c.json({ message: 'Not Found' }, 404);
    const body = (await c.req.json()) as {
      title?: string;
      body?: string;
      commits?: string[];
      action?: 'merge' | 'close' | 'reopen';
    };
    let action = 'edited';
    if (body.title !== undefined) pull.title = body.title;
    if (body.body !== undefined) pull.body = body.body;
    if (body.commits) {
      pull.commitMessages = [...(pull.commitMessages ?? []), ...body.commits];
      pull.headSha = fakeSha(`${repo.id}/${pull.head}/${pull.commitMessages.length}`);
      action = 'synchronize';
    }
    if (body.action === 'merge') {
      Object.assign(pull, { state: 'closed', merged: true, mergedAt: new Date().toISOString() });
      action = 'closed';
    } else if (body.action === 'close') {
      Object.assign(pull, { state: 'closed', merged: false });
      action = 'closed';
    } else if (body.action === 'reopen') {
      Object.assign(pull, { state: 'open', merged: false });
      action = 'reopened';
    }
    return c.json({
      headSha: pull.headSha,
      webhook: pullWebhook(repo, pull, action, state.webOrigin),
    });
  });

  /** Sets the check runs of a PR's head commit. Returns a check_suite webhook. */
  app.post('/__fake/repos/:id/checks', async (c) => {
    const repo = state.repos.find((r) => r.id === Number(c.req.param('id')));
    if (!repo) return c.json({ message: 'Not Found' }, 404);
    const body = (await c.req.json()) as { pull?: number; sha?: string; runs: FakeCheck[] };
    const pull = repo.pulls?.find((p) => p.number === body.pull);
    const sha = body.sha ?? pull?.headSha;
    if (!sha) return c.json({ message: 'no sha' }, 400);
    repo.checks ??= new Map();
    repo.checks.set(sha, body.runs);
    const done = body.runs.every((r) => r.status === 'completed');
    return c.json({
      webhook: {
        event: 'check_suite',
        payload: {
          action: done ? 'completed' : 'requested',
          check_suite: {
            head_sha: sha,
            status: done ? 'completed' : 'in_progress',
            conclusion: done
              ? body.runs.some((r) => r.conclusion === 'failure')
                ? 'failure'
                : 'success'
              : null,
            pull_requests: pull ? [{ number: pull.number }] : [],
          },
          repository: { id: repo.id },
        },
      },
    });
  });

  app.post('/__fake/repos/:id/issues', async (c) => {
    const repo = state.repos.find((r) => r.id === Number(c.req.param('id')));
    if (!repo) return c.json({ message: 'Not Found' }, 404);
    const { title, author } = (await c.req.json()) as { title: string; author?: string };
    const number = (repo.pulls?.length ?? 0) + (repo.issues?.length ?? 0) + 1;
    repo.issues = [
      ...(repo.issues ?? []),
      { number, title, author: author ?? repo.owner, createdAt: new Date().toISOString() },
    ];
    return c.json({ number });
  });

  app.get('/__fake/repos/:id', (c) => {
    const repo = state.repos.find((r) => r.id === Number(c.req.param('id')));
    if (!repo) return c.json({ message: 'Not Found' }, 404);
    const branches = Object.fromEntries(
      [...(repo.branches ?? new Map()).entries()].map(([b, m]) => [b, Object.fromEntries(m)]),
    );
    return c.json({ branches, commits: repo.commits ?? [], pulls: repo.pulls ?? [] });
  });

  app.post('/__fake/reset', (c) => {
    Object.assign(state, defaultFakeState(state.kyonOrigin));
    return c.json({ ok: true });
  });

  app.post('/__fake/config', async (c) => {
    const body = (await c.req.json()) as Partial<
      Pick<FakeState, 'accessTokenTtlSeconds' | 'kyonOrigin'>
    >;
    Object.assign(state, body);
    return c.json({ ok: true });
  });

  /** Creates a fresh user with its own installation and repos (isolates parallel e2e tests). */
  app.post('/__fake/users', async (c) => {
    const body = (await c.req.json()) as {
      login: string;
      repos: { name: string; private?: boolean; files?: Record<string, string> }[];
    };
    state.counter += 1;
    const userId = 2000 + state.counter;
    const installationId = 600 + state.counter;
    const repoIds = body.repos.map((repo, i) => {
      const id = 10_000 + state.counter * 100 + i;
      state.repos.push({
        id,
        owner: body.login,
        name: repo.name,
        private: repo.private ?? true,
        defaultBranch: 'main',
        installationId,
        branches: new Map([['main', new Map(Object.entries(repo.files ?? {}))]]),
      });
      return id;
    });
    state.users.push({ id: userId, login: body.login, repoIds });
    return c.json({ id: userId, repoIds });
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
export function installFakeFetch(
  fake: ReturnType<typeof createFakeGitHub>,
  baseUrl = 'http://fake-github.test',
): () => void {
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
