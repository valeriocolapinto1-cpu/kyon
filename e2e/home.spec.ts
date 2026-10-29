import { expect, expectNoA11yViolations, test } from './fixtures';
import { projectWithTasks } from './projects';

type TasksResponse = { files: { tasks: { id: string; text: string }[] }[] };

test('home blocks: my tasks, resume where I left off, customize, people and history', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const { context, page, projectId, tag } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    `home-${info.project.name}`,
  );
  const api = context.request;
  const me = (await (await api.get('/api/me')).json()) as { id: string; name: string };
  const tasks = (await (await api.post(`/api/projects/${projectId}/sync`)).json()) as TasksResponse;
  const parser = tasks.files[0]?.tasks.find((t) => t.text === 'Scrivere il parser');
  expect(parser).toBeTruthy();
  await api.patch(`/api/projects/${projectId}/tasks/${parser?.id}`, {
    data: { assigneeId: me.id, dueDate: '2030-01-15', priority: 'high' },
  });

  await page.goto('/');
  const myTasks = page.getByRole('region', { name: 'Le mie task' });
  await expect(myTasks.getByRole('link', { name: /Scrivere il parser/ })).toBeVisible();
  // Only the latest contribution is shown; the history has the rest.
  await expect(page.getByRole('region', { name: 'Ultimi contributi' })).toContainText(
    'Tutta la cronologia',
  );
  await expect(page.getByRole('region', { name: 'Chi è online' })).toContainText(me.name);
  await expectNoA11yViolations(page);

  // Opening the task leads into the project, with the detail open.
  await myTasks.getByRole('link', { name: /Scrivere il parser/ }).click();
  await expect(page).toHaveURL(new RegExp(`task=${parser?.id}`));
  await expect(page.getByRole('heading', { level: 2, name: `Task ${tag}` })).toBeVisible();
  // Saved after a pause on the page (navigation only).
  await page.waitForTimeout(2500);

  await page.goto('/');
  const resume = page.getByRole('link', { name: `Riprendi: Task ${tag}` });
  await expect(resume).toBeVisible();

  // Customize: hide "Ultimi contributi", move "Chi è online" first; it sticks after a reload.
  await page.getByRole('button', { name: 'Personalizza' }).click();
  const sheet = page.getByRole('dialog', { name: 'Personalizza la Home' });
  await sheet.getByRole('switch', { name: 'Ultimi contributi' }).click();
  for (let i = 0; i < 4; i++)
    await sheet.getByRole('button', { name: 'Sposta su Chi è online' }).click();
  await expect(sheet.getByRole('button', { name: 'Sposta su Chi è online' })).toBeDisabled();
  await expectNoA11yViolations(page);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Chi è online' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ultimi contributi' })).toHaveCount(0);
  const regions = await page
    .locator('main .grid > section[aria-labelledby^="home-"] h2')
    .allTextContents();
  expect(regions[0]).toContain('Chi è online');

  // People: from the online block to a profile with the shared project.
  await page.getByRole('link', { name: 'Tutte le persone' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Persone' })).toBeVisible();
  await page
    .getByRole('link', { name: new RegExp(me.name) })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(me.name) })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Progetti in comune' })).toContainText(
    `Task ${tag}`,
  );
  await expectNoA11yViolations(page);

  // Global history, filtered by project.
  await page.goto('/attivita');
  await expect(page.getByRole('heading', { level: 1, name: 'Cronologia' })).toBeVisible();
  await expect(page.getByText('ha assegnato').first()).toBeVisible();
  await page.getByLabel('Progetto').selectOption({ label: `Task ${tag}` });
  await expect(page).toHaveURL(new RegExp(`project=${projectId}`));
  await expect(page.getByText('ha assegnato').first()).toBeVisible();
  await expectNoA11yViolations(page);
  await context.close();
});

test('global search finds tasks and opens them; shortcuts on "?"', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'tablet', 'phone and desktop cover the two entry points');
  const { context, page, projectId, tag } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    `search-${info.project.name}`,
  );
  await context.request.post(`/api/projects/${projectId}/sync`);
  await page.goto('/');
  if (info.project.name === 'desktop') await page.keyboard.press('ControlOrMeta+k');
  else await page.getByRole('button', { name: /Cerca o salta a/ }).click();
  const input = page.getByRole('combobox', { name: 'Palette comandi' });
  await input.fill('coltura');
  const option = page.getByRole('option', { name: new RegExp(`Coltura di prova · Task ${tag}`) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/task=/);
  // The task detail is open (side panel on desktop, sheet on phones).
  await expect(page.getByRole('heading', { name: 'Dove si trova' })).toBeVisible();

  if (info.project.name === 'desktop') {
    await page.goto('/');
    await page.getByRole('heading', { level: 1, name: 'Home' }).waitFor();
    await page.keyboard.press('Shift+?');
    const shortcuts = page.getByRole('dialog', { name: 'Scorciatoie da tastiera' });
    await expect(shortcuts).toBeVisible();
    await expect(shortcuts).toContainText('Alt + frecce');
    await expectNoA11yViolations(page);
  }
  await context.close();
});

test('calendar feed from Settings: secret URL with my due dates', async ({
  browser,
  request,
  baseURL,
  playwright,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'API-heavy: one layout is enough');
  const { context, page, projectId, tag } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    'ics',
  );
  const tasks = (await (
    await context.request.post(`/api/projects/${projectId}/sync`)
  ).json()) as TasksResponse;
  const card = tasks.files[0]?.tasks.find((t) => t.text === 'Disegnare la card');
  await context.request.patch(`/api/projects/${projectId}/tasks/${card?.id}`, {
    data: { dueDate: '2031-03-02' },
  });
  await page.goto('/settings#calendar-title');
  const section = page.getByRole('region', { name: 'Calendario' });
  await section.getByRole('button', { name: 'Crea il feed' }).click();
  const url = await section.getByRole('textbox', { name: 'Indirizzo del feed' }).inputValue();
  expect(url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]+\.ics$/);
  await expectNoA11yViolations(page);

  // A calendar app has no cookies: the secret in the URL is the only key.
  const anonymous = await playwright.request.newContext();
  const feed = await anonymous.get(url);
  expect(feed.status()).toBe(200);
  const text = await feed.text();
  expect(text).toContain(`SUMMARY:Task ${tag}: Disegnare la card`);
  expect(text).toContain('DTSTART;VALUE=DATE:20310302');

  page.once('dialog', (d) => void d.accept());
  await section.getByRole('button', { name: 'Disattiva il feed' }).click();
  // The toast can be gone already on a busy machine: the feed itself is the proof.
  await expect.poll(async () => (await anonymous.get(url)).status()).toBe(404);
  await expect(section.getByRole('button', { name: 'Crea il feed' })).toBeVisible();
  await anonymous.dispose();
  await context.close();
});
