import { expect, expectNoA11yViolations, test } from './fixtures';
import { card, column, deliverWebhook, fakeControl, projectWithTasks, repoFile } from './projects';

test('prompt → copy → PR with marker → CI → merge closes the task → undo', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const base = baseURL ?? '';
  const { context, page, projectId, repoId } = await projectWithTasks(
    browser,
    request,
    base,
    `prompt-${info.project.name}`,
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await page.goto(`/progetti?id=${projectId}`);
  await expect(column(page, 'Da fare').getByText('Scrivere il parser')).toBeVisible();

  // From the task detail: "Scrivi un prompt per Claude" opens the Prompt tab with the task chosen.
  await card(page, 'Scrivere il parser').click();
  const detail =
    info.project.name === 'mobile' ? page.getByRole('dialog') : page.getByRole('complementary');
  await detail.getByRole('link', { name: 'Scrivi un prompt per Claude' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuovo prompt' });
  await expect(sheet.getByLabel('Task')).toHaveValue(/.+/);
  await expect(sheet.getByLabel('Titolo')).toHaveValue('Scrivere il parser');
  await sheet.getByRole('button', { name: 'Crea prompt' }).click();
  await expect(page).toHaveURL(/tab=prompt.*prompt=|prompt=.*tab=prompt/);
  // Keyboard lands on the new prompt, not on <body>.
  await expect(page.locator('#prompt-editor-title')).toBeFocused();

  // Edit with a variable and an unknown one, preview, save a version.
  const body = page.getByLabel('Testo del prompt');
  await body.fill('Implementa {{task}} leggendo {{file}}. {{boh}}');
  await expect(
    page.getByText('Variabili sconosciute (restano così nel testo): {{boh}}'),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Anteprima' }).click();
  await expect(page.getByText('Implementa Scrivere il parser leggendo TASKS.md.')).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('radio', { name: 'Scrivi' }).click();
  await page.getByLabel('Testo del prompt').fill('Implementa {{task}} leggendo {{file}}.');
  await page.getByRole('button', { name: 'Salva versione' }).click();
  await expect(page.getByText('Salvata la versione 2', { exact: true })).toBeVisible();

  // Copy: the clipboard gets the full prompt with the marker; the task goes to "In corso".
  await page.getByRole('button', { name: 'Copia prompt per Claude' }).click();
  await expect(
    page
      .getByRole('region', { name: /Notifiche/ })
      .getByText('Prompt copiato. Incollalo in Claude Code.'),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const runId = /^Kyon-Run: ([a-z0-9]{8})$/m.exec(copied)?.[1];
  expect(runId).toBeTruthy();
  expect(copied).toContain('Implementa Scrivere il parser leggendo TASKS.md.');
  const run = page.getByRole('article', { name: `Esecuzione ${runId}` });
  await expect(run.getByText('In attesa della PR')).toBeVisible();

  // Claude Code opens a PR with the marker: Kyon links it live.
  const pr = await fakeControl(request, `/repos/${repoId}/pulls`, {
    title: 'Parser',
    body: `Aggiunge il parser.\n\nKyon-Run: ${runId}`,
    head: `claude/${runId}-scrivere-il-parser`,
  });
  await deliverWebhook(request, base, pr.webhook);
  await expect(run.getByText(`PR aperta · PR #${pr.number}`)).toBeVisible();
  const checks = await fakeControl(request, `/repos/${repoId}/checks`, {
    pull: pr.number,
    runs: [{ name: 'test', status: 'completed', conclusion: 'success' }],
  });
  await deliverWebhook(request, base, checks.webhook);
  await expect(run.getByText(`CI superata · PR #${pr.number}`)).toBeVisible();
  await expectNoA11yViolations(page);

  // Merge: the task is ticked in the repo, the launcher gets a toast with "Annulla chiusura".
  const merged = await fakeControl(request, `/repos/${repoId}/pulls/${pr.number}`, {
    action: 'merge',
  });
  await deliverWebhook(request, base, merged.webhook);
  await expect(run.getByText(`Mergiata · PR #${pr.number}`)).toBeVisible();
  await expect.poll(() => repoFile(request, repoId)).toContain('- [x] Scrivere il parser');
  const toast = page.getByRole('region', { name: /Notifiche/ });
  await expect(toast.getByText('PR mergiata: "Scrivere il parser" è fatta')).toBeVisible();
  await run.getByRole('button', { name: 'Annulla chiusura' }).click();
  await expect.poll(() => repoFile(request, repoId)).toContain('- [ ] Scrivere il parser');
  await expect(run.getByRole('button', { name: 'Annulla chiusura' })).toHaveCount(0);

  // Back on the board: the card is in "In corso" with the run's state.
  await page.getByRole('tab', { name: 'Task' }).click();
  await expect(column(page, 'In corso').getByText('Scrivere il parser')).toBeVisible();
  await expect(
    column(page, 'In corso').getByRole('button', {
      name: new RegExp(`Scrivere il parser.*Mergiata · PR #${pr.number}`),
    }),
  ).toBeVisible();

  // Status tab: the PR merge and the completed task show up.
  await page.getByRole('tab', { name: 'Status' }).click();
  await expect(page.getByRole('heading', { name: 'Storico' })).toBeVisible();
  await expect(page.getByText(/PR mergiata per/).first()).toBeVisible();
  await expectNoA11yViolations(page);

  await context.close();
});

test('run without marker: manual link and "Verifica stato PR"; CLAUDE.md preview', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the main flow already runs on every viewport');
  const base = baseURL ?? '';
  const { context, page, projectId, repoId } = await projectWithTasks(
    browser,
    request,
    base,
    'manual',
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await page.goto(`/progetti?id=${projectId}&tab=prompt`);
  await page.getByRole('button', { name: 'Nuovo prompt' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuovo prompt' });
  await sheet.getByLabel('Task').selectOption({ label: 'Coltura di prova' });
  await sheet.getByRole('button', { name: 'Crea prompt' }).click();
  await page.getByRole('button', { name: 'Copia prompt per Claude' }).click();
  const run = page.getByRole('article', { name: /Esecuzione/ });
  await expect(run.getByText('In attesa della PR')).toBeVisible();

  const pr = await fakeControl(request, `/repos/${repoId}/pulls`, {
    title: 'Coltura',
    head: 'feat/coltura',
  });
  await run.getByRole('button', { name: 'Collega una PR' }).click();
  await run.getByLabel('Numero della PR').fill(String(pr.number));
  await run.getByRole('button', { name: 'Sì, collegala' }).click();
  await expect(run.getByText(`PR aperta · PR #${pr.number}`)).toBeVisible();

  // A merge whose webhook got lost: "Verifica stato PR" realigns and closes the task.
  await fakeControl(request, `/repos/${repoId}/pulls/${pr.number}`, { action: 'merge' });
  await run.getByRole('button', { name: 'Verifica stato PR' }).click();
  await expect(run.getByText(`Mergiata · PR #${pr.number}`)).toBeVisible();
  await expect.poll(() => repoFile(request, repoId)).toContain('- [x] Coltura di prova');

  await page.getByRole('button', { name: 'Genera CLAUDE.md' }).click();
  const claude = page.getByRole('dialog', { name: 'CLAUDE.md per la repo' });
  await expect(claude.getByText(/Kyon legge le task da questi file Markdown/)).toBeVisible();
  await expectNoA11yViolations(page);
  await context.close();
});
