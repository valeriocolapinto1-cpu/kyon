import { expect } from 'vitest';
import type { CookieJar } from './d1';
import type { createFakeGitHub } from './fakeGithub';
import { body, call } from './http';

export const FAKE = 'http://fake-github.test';

/** Runs the OAuth dance against the fake: connect → consent → callback. */
export async function connectGitHub(jar: CookieJar, login: string) {
  const start = await call('/api/github/connect', { jar });
  expect(start.status).toBe(302);
  jar.store(start);
  const authorize = new URL(start.headers.get('location') ?? '');
  const approve = new URL(`${FAKE}/login/oauth/authorize/approve`);
  approve.searchParams.set('login', login);
  approve.searchParams.set('redirect_uri', authorize.searchParams.get('redirect_uri') ?? '');
  approve.searchParams.set('state', authorize.searchParams.get('state') ?? '');
  const consent = await fetch(approve, { redirect: 'manual' });
  const done = await call(consent.headers.get('location') ?? '', { jar });
  expect(done.headers.get('location')).toContain('github=connected');
}

/** Creates a fake GitHub user owning one repo with the given files. */
export async function fakeRepo(
  fake: ReturnType<typeof createFakeGitHub>,
  login: string,
  name: string,
  files: Record<string, string>,
) {
  const res = await fake.app.fetch(
    new Request(`${FAKE}/__fake/users`, {
      method: 'POST',
      body: JSON.stringify({ login, repos: [{ name, files }] }),
      headers: { 'content-type': 'application/json' },
    }),
  );
  const { repoIds } = (await res.json()) as { repoIds: number[] };
  return repoIds[0] ?? 0;
}

/** Exposes the user's repo to the group and makes it a project. Returns the project id. */
export async function projectFromRepo(
  jar: CookieJar,
  fullName: string,
  name: string,
  /** Chooses every non-archive .md as a checklist (what Kyon used to read); false leaves the choice to the test. */
  selectFiles = true,
) {
  const { repos } = await body(call('/api/repos', { jar }));
  const repo = repos.find(
    (r: { fullName: string; mine: boolean }) => r.fullName === fullName && r.mine,
  );
  await call(`/api/repos/${repo.id}`, { method: 'PATCH', jar, json: { exposure: 'group' } });
  const created = await body(
    call('/api/projects', { method: 'POST', jar, json: { repoId: repo.id, name } }),
  );
  const id = created.id as string;
  if (selectFiles) {
    const { files } = await body(call(`/api/projects/${id}/markdown-files`, { jar }));
    await call(`/api/projects/${id}`, {
      method: 'PATCH',
      jar,
      json: {
        checklistFiles: (files as { path: string; kind: string }[])
          .filter((f) => f.kind === 'tasks')
          .map((f) => f.path),
      },
    });
  }
  return id;
}

export function repoFiles(
  fake: ReturnType<typeof createFakeGitHub>,
  repoId: number,
  branch = 'main',
) {
  const repo = fake.state.repos.find((r) => r.id === repoId);
  return repo?.branches?.get(branch) ?? new Map<string, string>();
}

/** Adds files to the project's checklists (what an owner does in "File checklist"). */
export async function selectChecklistFiles(jar: CookieJar, projectId: string, paths: string[]) {
  const { selected } = await body(call(`/api/projects/${projectId}/markdown-files`, { jar }));
  await call(`/api/projects/${projectId}`, {
    method: 'PATCH',
    jar,
    json: { checklistFiles: [...new Set([...((selected as string[] | null) ?? []), ...paths])] },
  });
}
