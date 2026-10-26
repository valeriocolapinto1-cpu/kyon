import { createHmac } from 'node:crypto';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { FAKE_GITHUB, connectGitHub, expect, newMember } from './fixtures';

/** Same secret as scripts/lib/e2e.ts (GITHUB_WEBHOOK_SECRET of the e2e Worker). */
const WEBHOOK_SECRET = 'e2e-webhook-secret';

export const TASKS_MD = `# Piano

## Prossimi passi

- [ ] Scrivere il parser
- [ ] Disegnare la card
- [x] Scegliere il nome
  - [ ] Sottotask del nome

## Biologia

- [ ] Coltura di prova
`;

export interface Setup {
  context: BrowserContext;
  page: Page;
  projectId: string;
  repoId: number;
  tag: string;
}

/** A member with a connected (fake) GitHub, a repo with TASKS.md and a project on it. */
export async function projectWithTasks(
  browser: Browser,
  request: APIRequestContext,
  baseURL: string,
  label: string,
): Promise<Setup> {
  const tag = `${label}-${Date.now()}`;
  const login = `gh-${tag}`;
  const res = await request.post(`${FAKE_GITHUB}/__fake/users`, {
    data: { login, repos: [{ name: `repo-${tag}`, files: { 'TASKS.md': TASKS_MD } }] },
  });
  const { repoIds } = (await res.json()) as { repoIds: number[] };
  const owner = await newMember(browser, request, baseURL, `tasks-${tag}`);
  const page = await owner.context.newPage();
  await connectGitHub(page, login);
  const api = owner.context.request;
  const { repos } = (await (await api.get('/api/repos')).json()) as {
    repos: { id: string; fullName: string; mine: boolean }[];
  };
  const repo = repos.find((r) => r.fullName === `${login}/repo-${tag}` && r.mine);
  expect(repo).toBeTruthy();
  await api.patch(`/api/repos/${repo?.id}`, { data: { exposure: 'group' } });
  const created = await api.post('/api/projects', {
    data: { repoId: repo?.id, name: `Task ${tag}` },
  });
  const { id } = (await created.json()) as { id: string };
  return { context: owner.context, page, projectId: id, repoId: repoIds[0] ?? 0, tag };
}

export async function repoFile(request: APIRequestContext, repoId: number) {
  const res = await request.get(`${FAKE_GITHUB}/__fake/repos/${repoId}`);
  const body = (await res.json()) as { branches: Record<string, Record<string, string>> };
  return body.branches.main?.['TASKS.md'] ?? '';
}

export const column = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Kanban' })
    .getByRole('region', { name: new RegExp(`^${name}`) });
export const card = (page: Page, text: string) =>
  page.locator('[data-card-id]').filter({ hasText: text }).getByRole('button').first();

/** Delivers a webhook to Kyon as GitHub would: signed with the app's secret. */
export async function deliverWebhook(
  request: APIRequestContext,
  baseURL: string,
  webhook: { event: string; payload: unknown },
) {
  const body = JSON.stringify(webhook.payload);
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  const res = await request.post(`${baseURL}/api/github/webhook`, {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-github-event': webhook.event,
      'x-hub-signature-256': `sha256=${signature}`,
    },
  });
  expect(res.status()).toBe(200);
}

/** Test controls of the fake GitHub (they return the webhook GitHub would send). */
export async function fakeControl(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(`${FAKE_GITHUB}/__fake${path}`, { data });
  return (await res.json()) as { number: number; webhook: { event: string; payload: unknown } };
}
