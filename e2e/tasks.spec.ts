import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import {
  FAKE_GITHUB,
  connectGitHub,
  expect,
  expectNoA11yViolations,
  newMember,
  test,
} from './fixtures';

const TASKS_MD = `# Piano

## Prossimi passi

- [ ] Scrivere il parser
- [ ] Disegnare la card
- [x] Scegliere il nome
  - [ ] Sottotask del nome

## Biologia

- [ ] Coltura di prova
`;

interface Setup {
  context: BrowserContext;
  page: Page;
  projectId: string;
  repoId: number;
  tag: string;
}

/** A member with a connected (fake) GitHub, a repo with TASKS.md and a project on it. */
async function projectWithTasks(
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

async function repoFile(request: APIRequestContext, repoId: number) {
  const res = await request.get(`${FAKE_GITHUB}/__fake/repos/${repoId}`);
  const body = (await res.json()) as { branches: Record<string, Record<string, string>> };
  return body.branches.main?.['TASKS.md'] ?? '';
}

const column = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Kanban' })
    .getByRole('region', { name: new RegExp(`^${name}`) });
const card = (page: Page, text: string) =>
  page.locator('[data-card-id]').filter({ hasText: text }).getByRole('button').first();

test('kanban: read tasks, move with the keyboard, tick with a commit, edit details', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const { context, page, projectId, repoId } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    info.project.name,
  );
  await page.goto(`/progetti?id=${projectId}`);

  // First visit: Kyon reads the repo by itself.
  await expect(column(page, 'Da fare').getByText('Scrivere il parser')).toBeVisible();
  await expect(column(page, 'Fatto').getByText('Scegliere il nome')).toBeVisible();
  // Subtasks stay inside their parent's card.
  await expect(
    page.locator('[data-card-id]').filter({ hasText: 'Sottotask del nome' }),
  ).toHaveCount(0);
  await expect(page.getByText('0 di 1 sottotask')).toBeAttached();
  await expectNoA11yViolations(page);

  // Keyboard only: focus the first card, go down, move it to "In corso" with Alt+→.
  await card(page, 'Scrivere il parser').focus();
  await page.keyboard.press('ArrowDown');
  await expect(card(page, 'Disegnare la card')).toBeFocused();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(column(page, 'In corso').getByText('Disegnare la card')).toBeVisible();
  await expect(page.getByText('Spostata in In corso, posizione 1 di 1.')).toBeAttached();
  await expect(card(page, 'Disegnare la card')).toBeFocused();
  // A move between non-done columns never touches the repo.
  expect(await repoFile(request, repoId)).toContain('- [ ] Disegnare la card');

  // "X" ticks it: one-line commit in the repo, card in "Fatto", toast with undo.
  await page.keyboard.press('x');
  await expect(column(page, 'Fatto').getByText('Disegnare la card')).toBeVisible();
  await expect.poll(() => repoFile(request, repoId)).toContain('- [x] Disegnare la card');
  await expect(
    page.getByRole('region', { name: /Notifiche/ }).getByText('Task completata', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Annulla' }).click();
  await expect.poll(() => repoFile(request, repoId)).toContain('- [ ] Disegnare la card');

  // "Sposta in…" from the actions menu.
  await page.getByRole('button', { name: 'Azioni: Coltura di prova' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Da fare' })).toBeChecked();
  await page.getByRole('menuitemradio', { name: 'In corso' }).click();
  await expect(column(page, 'In corso').getByText('Coltura di prova')).toBeVisible();

  // Detail: priority, due date, notes; history records it.
  await card(page, 'Scrivere il parser').click();
  await expect(page).toHaveURL(/task=/);
  const detail =
    info.project.name === 'mobile' ? page.getByRole('dialog') : page.getByRole('complementary');
  await detail.getByLabel('Priorità').selectOption('high');
  await detail.getByLabel('Scadenza', { exact: true }).fill('2026-11-03');
  await detail.getByLabel('Note di Kyon').click();
  await detail.getByLabel('Note di Kyon').fill('Partire dai test');
  await detail.getByLabel('Scadenza', { exact: true }).click(); // blur notes
  await expect(detail.getByText(/ha cambiato la priorità in Alta/)).toBeVisible();
  await expect(
    detail.getByText(/ha impostato la scadenza al martedì 3 novembre 2026/),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await detail
    .getByRole('button', { name: info.project.name === 'mobile' ? 'Chiudi' : 'Chiudi dettaglio' })
    .click();
  await expect(page).not.toHaveURL(/task=/);
  // Focus is back on the card that opened the detail.
  await expect(card(page, 'Scrivere il parser')).toBeFocused();
  await expect(card(page, 'Scrivere il parser')).toContainText('Alta');

  // List view: grouped by section, subtasks nested, checkbox ticks the repo.
  await page.getByRole('radio', { name: 'Lista' }).click();
  await expect(page.getByRole('list', { name: 'Piano › Biologia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sottotask del nome' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Calendar: the task sits on its day; Alt+→ moves it to the next one.
  await page.getByRole('radio', { name: 'Calendario' }).click();
  await page.getByRole('radio', { name: 'Agenda' }).click();
  const day = page.getByRole('region', { name: /martedì 3 novembre 2026/ });
  await expect(day.getByText('Scrivere il parser')).toBeVisible();
  await expectNoA11yViolations(page);
  await day.getByRole('button', { name: /Scrivere il parser/ }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(
    page.getByRole('region', { name: /mercoledì 4 novembre 2026/ }).getByText('Scrivere il parser'),
  ).toBeVisible();

  await context.close();
});

test('drag and drop to "Fatto" commits once after the pause, live update in another browser', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse drag and two browsers: desktop is enough');
  const { context, page, projectId, repoId } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    'dnd',
  );
  // A second member, added to the project, watching the same board.
  const other = await newMember(browser, request, baseURL ?? '', 'watcher');
  const otherMe = (await (await other.context.request.get('/api/me')).json()) as { id: string };
  await context.request.post(`/api/projects/${projectId}/members`, {
    data: { userId: otherMe.id, role: 'member' },
  });
  const otherPage = await other.context.newPage();

  await page.goto(`/progetti?id=${projectId}`);
  await otherPage.goto(`/progetti?id=${projectId}`);
  await expect(otherPage.locator('[data-realtime="open"]')).toBeVisible();
  await expect(page.locator('[data-realtime="open"]')).toBeVisible();

  const source = card(page, 'Coltura di prova');
  const target = column(page, 'Fatto');
  await page.getByRole('region', { name: 'Kanban' }).scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('no layout');
  const commitsBefore = (
    (await (await request.get(`${FAKE_GITHUB}/__fake/repos/${repoId}`)).json()) as {
      commits: unknown[];
    }
  ).commits.length;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect(column(page, 'Fatto').getByText('Coltura di prova')).toBeVisible();
  await expect(page.getByText('Salvo su GitHub…')).toBeVisible();
  // Nothing written yet (debounce), then exactly one commit.
  expect(await repoFile(request, repoId)).toContain('- [ ] Coltura di prova');
  await expect
    .poll(() => repoFile(request, repoId), { timeout: 10_000 })
    .toContain('- [x] Coltura di prova');
  const commits = (
    (await (await request.get(`${FAKE_GITHUB}/__fake/repos/${repoId}`)).json()) as {
      commits: { message: string }[];
    }
  ).commits;
  expect(commits.length - commitsBefore).toBe(1);
  expect(commits.at(-1)?.message).toBe('chore(tasks): complete "Coltura di prova" via Kyon');

  // The other browser sees it without reloading.
  await expect(column(otherPage, 'Fatto').getByText('Coltura di prova')).toBeVisible();

  await context.close();
  await other.context.close();
});
