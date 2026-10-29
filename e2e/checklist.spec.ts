import { expect, expectNoA11yViolations, test } from './fixtures';
import { TASKS_MD, column, projectWithTasks } from './projects';

const IDEE_MD = `# Idee

## Elenco

- [ ] Idea sparsa uno
- [ ] Idea sparsa due
`;

test('a new project asks which .md files are checklists; each shows as a drop-down in the board', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const { page, projectId } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    info.project.name,
    { files: { 'TASKS.md': TASKS_MD, 'docs/IDEE.md': IDEE_MD }, select: false },
  );
  await page.goto(`/progetti?id=${projectId}`);

  // Nothing is read until the owner chooses.
  await expect(page.getByRole('heading', { name: 'Quali file sono checklist?' })).toBeVisible();
  await expect(page.locator('[data-card-id]')).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.getByRole('checkbox', { name: /^TASKS\.md/ }).check();
  await page.getByRole('checkbox', { name: /^docs\/IDEE\.md/ }).check();
  await page.getByRole('button', { name: 'Salva e leggi' }).click();

  // Two files in "Da fare": two drop-downs, closed.
  const todo = column(page, 'Da fare');
  const tasks = todo.getByRole('button', { name: /^TASKS\.md/ });
  const idee = todo.getByRole('button', { name: /^docs\/IDEE\.md/ });
  await expect(tasks).toHaveAttribute('aria-expanded', 'false');
  await expect(idee).toHaveAttribute('aria-expanded', 'false');
  await expect(todo.locator('[data-card-id]')).toHaveCount(0);

  await idee.click();
  await expect(idee).toHaveAttribute('aria-expanded', 'true');
  await expect(todo.getByText('Idea sparsa uno')).toBeVisible();
  await expect(todo.getByText('Scrivere il parser')).toHaveCount(0);
  await expectNoA11yViolations(page);

  // Un-choose the ideas: they leave the board, the other file stays.
  await page.getByRole('button', { name: 'Altre azioni' }).click();
  await page.getByRole('menuitem', { name: 'File checklist' }).click();
  const dialog = page.getByRole('dialog', { name: 'File checklist' });
  await dialog.getByRole('checkbox', { name: /^docs\/IDEE\.md/ }).uncheck();
  await dialog.getByRole('button', { name: 'Salva e leggi' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Idea sparsa uno')).toHaveCount(0);
  // A lone file opens by itself.
  await expect(column(page, 'Da fare').getByText('Scrivere il parser')).toBeVisible();
});
