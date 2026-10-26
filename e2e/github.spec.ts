import { expect, expectNoA11yViolations, newMember, test } from './fixtures';
import type { Page } from '@playwright/test';

const FAKE_GITHUB = 'http://localhost:8799';

async function connectGitHub(page: Page, login: string) {
  await page.goto('/settings#github');
  await page.getByRole('link', { name: 'Collega GitHub' }).click();
  // Fake GitHub consent page.
  await page.getByRole('link', { name: `Autorizza come ${login}` }).click();
  await expect(page.getByText(`Collegato come ${login}`)).toBeVisible();
}

test('connect GitHub, expose a repo, create a project and keep hidden repos private', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const tag = `${info.project.name}-${Date.now()}`;
  const login = `gh-${tag}`;
  await request.post(`${FAKE_GITHUB}/__fake/users`, {
    data: { login, repos: [{ name: `pubblica-${tag}` }, { name: `segreta-${tag}` }] },
  });
  // The other member must exist before the project is created to be added automatically.
  const owner = await newMember(browser, request, baseURL ?? '', `owner-${tag}`);
  const other = await newMember(browser, request, baseURL ?? '', `other-${tag}`);
  const page = await owner.context.newPage();

  await connectGitHub(page, login);
  const list = page
    .getByRole('heading', { name: 'Le tue repo' })
    .locator('xpath=following-sibling::ul[1]');
  await expect(list.getByRole('button')).toHaveCount(2);
  await expectNoA11yViolations(page);

  // Expose one repo to the whole group.
  await list.getByRole('button', { name: new RegExp(`pubblica-${tag}`) }).click();
  await page.getByRole('radio', { name: /Tutto il gruppo/ }).click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(
    list.getByRole('button', { name: new RegExp(`pubblica-${tag}.*Tutto il gruppo`) }),
  ).toBeVisible();

  // Create the project from it.
  await page.goto('/progetti');
  await page.getByRole('button', { name: 'Nuovo progetto' }).first().click();
  await expect(page.getByRole('radio', { name: new RegExp(`segreta-${tag}`) })).toHaveCount(0);
  await page.getByRole('radio', { name: new RegExp(`pubblica-${tag}`) }).click();
  await page.getByLabel('Nome del progetto').fill(`Progetto ${tag}`);
  await page.getByRole('button', { name: 'Crea progetto' }).click();
  await expect(page).toHaveURL(/\/progetti\?id=/);
  await expect(page.getByRole('heading', { name: `Progetto ${tag}` })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Task' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Task' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=prompt/);
  await expectNoA11yViolations(page);

  // The other member sees the project, but never the hidden repo.
  const otherPage = await other.context.newPage();
  await otherPage.goto('/progetti');
  await expect(otherPage.getByRole('link', { name: new RegExp(`Progetto ${tag}`) })).toBeVisible();
  await otherPage.getByRole('button', { name: 'Nuovo progetto' }).first().click();
  await expect(otherPage.getByRole('radio', { name: new RegExp(`segreta-${tag}`) })).toHaveCount(0);
  await otherPage.keyboard.press('Escape');

  // Members can't delete; the owner can, after typing the name.
  await otherPage.getByRole('link', { name: new RegExp(`Progetto ${tag}`) }).click();
  await otherPage.getByRole('button', { name: 'Menu progetto' }).click();
  await expect(otherPage.getByRole('button', { name: 'Elimina progetto' })).toHaveCount(0);
  await expect(otherPage.getByRole('button', { name: 'Abbandona progetto' })).toBeVisible();

  await page.getByRole('button', { name: 'Menu progetto' }).click();
  await page.getByRole('button', { name: 'Elimina progetto' }).click();
  const confirm = page.getByRole('button', { name: 'Elimina progetto' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(new RegExp('per confermare')).fill(`Progetto ${tag}`);
  await confirm.click();
  await expect(page.getByText('Progetto eliminato', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/progetti$/);

  await owner.context.close();
  await other.context.close();
});
