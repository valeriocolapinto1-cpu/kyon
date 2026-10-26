import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { hmacSha256Hex } from '@kyon/core';
import { createDb } from '@/db/client';
import { githubConnection, githubRepo } from '@/db/schema';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();

/** Runs the OAuth dance against the fake: connect → consent page → callback. */
async function connectGitHub(jar: CookieJar, login: string) {
  const start = await call('/api/github/connect', { jar });
  expect(start.status).toBe(302);
  jar.store(start);
  const authorize = new URL(start.headers.get('location') ?? '');
  const approve = new URL('http://fake-github.test/login/oauth/authorize/approve');
  approve.searchParams.set('login', login);
  approve.searchParams.set('redirect_uri', authorize.searchParams.get('redirect_uri') ?? '');
  approve.searchParams.set('state', authorize.searchParams.get('state') ?? '');
  const consent = await fetch(approve, { redirect: 'manual' });
  const callbackUrl = consent.headers.get('location') ?? '';
  const done = await call(callbackUrl, { jar });
  expect(done.status).toBe(302);
  expect(done.headers.get('location')).toContain('/settings?github=connected');
}

const repoOf = (
  repos: { fullName: string; mine: boolean; id: string }[],
  name: string,
  mine = true,
) => repos.find((r) => r.fullName === name && r.mine === mine);

describe('GitHub, repo visibility and projects', () => {
  let dispose: () => Promise<void>;
  let restoreFetch: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let terzo: CookieJar;
  let projectId: string;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests' });
    restoreFetch = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    terzo = await inviteAndJoin(valerio, 'Terzo', 'terzo@kyon.test');
  });
  afterAll(async () => {
    restoreFetch();
    await dispose();
  });

  it('reports the app as configured and not yet connected', async () => {
    const status = await body(call('/api/github', { jar: valerio }));
    expect(status).toMatchObject({
      configured: true,
      connection: null,
      installUrl: 'http://fake-github.test/apps/kyon-test/installations/new',
    });
  });

  it('rejects a callback with the wrong state', async () => {
    const res = await call('/api/github/callback?code=whatever&state=forged', { jar: valerio });
    expect(res.headers.get('location')).toContain('github=error');
  });

  it('connects through OAuth, stores tokens encrypted and lists repos as hidden', async () => {
    await connectGitHub(valerio, 'valerio-gh');
    const status = await body(call('/api/github', { jar: valerio }));
    expect(status.connection.login).toBe('valerio-gh');

    const [row] = await createDb(env.DB).select().from(githubConnection);
    expect(row?.accessToken).not.toContain('fake_at_');
    expect(row?.accessToken.startsWith('v1.')).toBe(true);

    const { repos } = await body(call('/api/repos', { jar: valerio }));
    expect(repos.map((r: { fullName: string }) => r.fullName).sort()).toEqual([
      'cerbero/allenamento',
      'valerio-gh/sito-personale',
    ]);
    expect(repos.every((r: { exposure: string }) => r.exposure === 'hidden')).toBe(true);
  });

  it('keeps hidden repos invisible to others', async () => {
    await connectGitHub(christian, 'christian-gh');
    const { repos } = await body(call('/api/repos', { jar: christian }));
    // Only his own rows: valerio's are hidden.
    expect(repos.every((r: { mine: boolean }) => r.mine)).toBe(true);
    expect((await body(call('/api/repos', { jar: terzo }))).repos).toEqual([]);
  });

  it('exposes a repo to the group and creates a project with everyone who can see it', async () => {
    const { repos } = await body(call('/api/repos', { jar: valerio }));
    const allenamento = repoOf(repos, 'cerbero/allenamento');
    // A hidden repo can't become a project.
    const refused = await call('/api/projects', {
      method: 'POST',
      jar: valerio,
      json: { repoId: allenamento?.id, name: 'Biohybrid' },
    });
    expect(refused.status).toBe(400);

    await call(`/api/repos/${allenamento?.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { exposure: 'group' },
    });
    const seenByTerzo = (await body(call('/api/repos', { jar: terzo }))).repos;
    expect(seenByTerzo.map((r: { fullName: string }) => r.fullName)).toEqual([
      'cerbero/allenamento',
    ]);
    expect(seenByTerzo[0].sharedWith).toEqual([]);

    const created = await call('/api/projects', {
      method: 'POST',
      jar: valerio,
      json: { repoId: allenamento?.id, name: 'Biohybrid' },
    });
    expect(created.status).toBe(201);
    projectId = (await body(created)).id;
    const detail = await body(call(`/api/projects/${projectId}`, { jar: christian }));
    expect(detail.role).toBe('member');
    expect(
      detail.members.map((m: { name: string; role: string }) => `${m.name}:${m.role}`).sort(),
    ).toEqual(['Christian:member', 'Terzo:member', 'Valerio:owner']);
  });

  it('allows one project per repo, whoever connected it', async () => {
    const { repos } = await body(call('/api/repos', { jar: christian }));
    const mine = repoOf(repos, 'cerbero/allenamento');
    await call(`/api/repos/${mine?.id}`, {
      method: 'PATCH',
      jar: christian,
      json: { exposure: 'group' },
    });
    const res = await call('/api/projects', {
      method: 'POST',
      jar: christian,
      json: { repoId: mine?.id, name: 'Doppione' },
    });
    expect(res.status).toBe(409);
  });

  it('shares with selected people only', async () => {
    const people = (await body(call('/api/people', { jar: valerio }))).people as {
      id: string;
      name: string;
    }[];
    const christianId = people.find((p) => p.name === 'Christian')?.id;
    const sito = repoOf(
      (await body(call('/api/repos', { jar: valerio }))).repos,
      'valerio-gh/sito-personale',
    );
    await call(`/api/repos/${sito?.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { exposure: 'selected', sharedWith: [christianId] },
    });
    expect(
      (await body(call('/api/repos', { jar: christian }))).repos.some(
        (r: { fullName: string }) => r.fullName === 'valerio-gh/sito-personale',
      ),
    ).toBe(true);
    expect(
      (await body(call('/api/repos', { jar: terzo }))).repos.some(
        (r: { fullName: string }) => r.fullName === 'valerio-gh/sito-personale',
      ),
    ).toBe(false);
    // Terzo can't create a project from it either (it doesn't exist for him).
    const res = await call('/api/projects', {
      method: 'POST',
      jar: terzo,
      json: { repoId: sito?.id, name: 'x' },
    });
    expect(res.status).toBe(404);
  });

  it('warns the owner when narrowing visibility, without removing members', async () => {
    const allenamento = repoOf(
      (await body(call('/api/repos', { jar: valerio }))).repos,
      'cerbero/allenamento',
    );
    const res = await body(
      call(`/api/repos/${allenamento?.id}`, {
        method: 'PATCH',
        jar: valerio,
        json: { exposure: 'self' },
      }),
    );
    expect(res.lostAccess.sort()).toEqual(['Christian', 'Terzo']);
    expect((await call(`/api/projects/${projectId}`, { jar: terzo })).status).toBe(200);
    await call(`/api/repos/${allenamento?.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { exposure: 'group' },
    });
  });

  it('enforces project roles', async () => {
    const people = (await body(call('/api/people', { jar: valerio }))).people as {
      id: string;
      name: string;
    }[];
    const terzoId = people.find((p) => p.name === 'Terzo')?.id ?? '';
    // Members can't change settings.
    expect(
      (
        await call(`/api/projects/${projectId}`, {
          method: 'PATCH',
          jar: christian,
          json: { commitMode: 'branch_pr' },
        })
      ).status,
    ).toBe(403);
    // Owner can, and can demote someone to viewer.
    expect(
      (
        await call(`/api/projects/${projectId}`, {
          method: 'PATCH',
          jar: valerio,
          json: { commitMode: 'branch_pr', viewersCanComment: true },
        })
      ).status,
    ).toBe(200);
    const after = await body(
      call(`/api/projects/${projectId}/members/${terzoId}`, {
        method: 'PATCH',
        jar: valerio,
        json: { role: 'viewer' },
      }),
    );
    expect(after.members.find((m: { name: string }) => m.name === 'Terzo').role).toBe('viewer');
    const asViewer = await body(call(`/api/projects/${projectId}`, { jar: terzo }));
    expect(asViewer.permissions).toMatchObject({
      'project:edit_tasks': false,
      'project:comment': true,
      'project:settings': false,
    });
    // The owner can't leave or remove themselves.
    expect(
      (await call(`/api/projects/${projectId}/leave`, { method: 'POST', jar: valerio })).status,
    ).toBe(403);
  });

  it('hides projects from non-members with a 404', async () => {
    await call(`/api/projects/${projectId}/leave`, { method: 'POST', jar: terzo });
    expect((await call(`/api/projects/${projectId}`, { jar: terzo })).status).toBe(404);
    expect((await body(call('/api/projects', { jar: terzo }))).projects).toEqual([]);
  });

  it('transfers ownership, archives (read-only) and deletes with a typed confirmation', async () => {
    const people = (await body(call('/api/people', { jar: valerio }))).people as {
      id: string;
      name: string;
    }[];
    const christianId = people.find((p) => p.name === 'Christian')?.id;
    const transferred = await body(
      call(`/api/projects/${projectId}/transfer`, {
        method: 'POST',
        jar: valerio,
        json: { userId: christianId },
      }),
    );
    expect(transferred.role).toBe('member');
    const archived = await body(
      call(`/api/projects/${projectId}/archive`, {
        method: 'POST',
        jar: christian,
        json: { archived: true },
      }),
    );
    expect(archived.archived).toBe(true);
    expect(archived.permissions['project:edit_tasks']).toBe(false);
    expect(
      (
        await call(`/api/projects/${projectId}`, {
          method: 'DELETE',
          jar: christian,
          json: { confirmName: 'sbagliato' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`/api/projects/${projectId}`, {
          method: 'DELETE',
          jar: christian,
          json: { confirmName: 'Biohybrid' },
        })
      ).status,
    ).toBe(200);
    expect((await call(`/api/projects/${projectId}`, { jar: christian })).status).toBe(404);
  });

  it('refreshes expired access tokens transparently', async () => {
    fake.state.accessTokenTtlSeconds = 60; // below the 5-minute refresh margin
    await connectGitHub(terzo, 'valerio-gh');
    const before = (await createDb(env.DB).select().from(githubConnection)).find(
      (c) => c.login === 'valerio-gh' && c.accessToken,
    );
    const res = await call('/api/github/sync', { method: 'POST', jar: terzo });
    expect(res.status).toBe(200);
    const rows = await createDb(env.DB).select().from(githubConnection);
    expect(rows.some((r) => r.accessToken !== before?.accessToken)).toBe(true);
    fake.state.accessTokenTtlSeconds = 8 * 60 * 60;
  });

  it('accepts only signed webhooks and marks removed repos unavailable', async () => {
    const payload = JSON.stringify({
      action: 'removed',
      repositories_removed: [{ id: 9002 }],
      installation: { id: 501 },
      sender: { id: 1001 },
    });
    const unsigned = await call('/api/github/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'x-github-event': 'installation_repositories' },
    });
    expect(unsigned.status).toBe(401);
    const signature = `sha256=${await hmacSha256Hex('fake-webhook-secret', payload)}`;
    const signed = await call('/api/github/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'x-github-event': 'installation_repositories', 'x-hub-signature-256': signature },
    });
    expect(signed.status).toBe(200);
    const rows = await createDb(env.DB)
      .select()
      .from(githubRepo)
      .where(eq(githubRepo.githubRepoId, 9002));
    expect(rows.every((r) => !r.available)).toBe(true);
    // Unavailable repos disappear for everyone but the person who connected them.
    expect(
      (await body(call('/api/repos', { jar: christian }))).repos.some(
        (r: { fullName: string; mine: boolean }) => r.fullName === 'valerio-gh/sito-personale',
      ),
    ).toBe(false);
  });
});
