import { expect, test as setup } from '@playwright/test';
import { ADMIN, E2E_BOOTSTRAP } from './fixtures';

setup('bootstrap the admin account', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('kyon.lite-detected', '0'));
  await page.goto(`/join?code=${E2E_BOOTSTRAP}`);
  await expect(page.getByText('Sei il primo')).toBeVisible();
  await page.getByLabel('Nome').fill(ADMIN.name);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Ripeti la password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Crea account' }).click();
  // The welcome tour on first access: skipped once, remembered in the account.
  await page.getByRole('button', { name: 'Salta' }).click({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({
    timeout: 15_000,
  });
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
