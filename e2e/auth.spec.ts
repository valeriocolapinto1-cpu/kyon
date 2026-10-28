import { ADMIN, expect, expectNoA11yViolations, newMember, test } from './fixtures';

test.describe('auth', () => {
  test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('redirects to login and back to the requested page', async ({ page }) => {
      await page.goto('/progetti');
      await expect(page).toHaveURL(/\/login\?next=%2Fprogetti/);
      await page.getByLabel('Email').fill(ADMIN.email);
      await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
      await page.getByRole('button', { name: 'Accedi' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Progetti' })).toBeVisible();
    });

    test('shows a clear error for a wrong password', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(ADMIN.email);
      await page.getByLabel('Password', { exact: true }).fill('password sbagliata');
      await page.getByRole('button', { name: 'Accedi' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Email o password' })).toHaveText(
        'Email o password non corretti.',
      );
    });

    test('refuses unknown invites and the used bootstrap code', async ({ page }) => {
      await page.goto('/join?code=AAAA-BBBB-CCCC-DDDD');
      await expect(page.getByRole('heading', { name: 'Invito non valido' })).toBeVisible();
      await page.goto('/join?code=e2e-bootstrap-code-kyon');
      await expect(page.getByRole('heading', { name: 'Invito non valido' })).toBeVisible();
    });

    test('login and join pages are accessible', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('heading', { name: 'Bentornato' }).waitFor();
      await expectNoA11yViolations(page);
      await page.goto('/join?code=AAAA-BBBB-CCCC-DDDD');
      await page.getByRole('heading', { name: 'Invito non valido' }).waitFor();
      await expectNoA11yViolations(page);
    });
  });

  test('an invited member can sign up through the link, once', async ({
    page,
    browser,
    baseURL,
  }, info) => {
    // The admin creates an invite from Settings.
    await page.goto('/settings');
    await page.getByLabel('Per chi è? (facoltativo)').fill(`Ospite ${info.project.name}`);
    await page.getByRole('button', { name: 'Nuovo invito' }).click();
    const link = await page.getByRole('textbox', { name: 'Copia link' }).inputValue();
    expect(link).toMatch(/\/join\?code=[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

    const guest = await browser.newContext({ baseURL });
    const guestPage = await guest.newPage();
    await guestPage.goto(link);
    const email = `ospite-${info.project.name}-${Date.now()}@kyon.test`;
    await guestPage.getByLabel('Nome').fill('Ospite');
    await guestPage.getByLabel('Email').fill(email);
    await guestPage.getByLabel('Password', { exact: true }).fill('corta');
    await guestPage.getByLabel('Ripeti la password').fill('corta');
    await guestPage.getByRole('button', { name: 'Crea account' }).click();
    await expect(guestPage.getByText('La password deve avere almeno 10 caratteri.')).toBeVisible();
    await guestPage.getByLabel('Password', { exact: true }).fill('una password lunga');
    await guestPage.getByLabel('Ripeti la password').fill('una password lunga');
    await guestPage.getByRole('button', { name: 'Crea account' }).click();
    // First access: the welcome tour, step by step, then it's remembered.
    const tour = guestPage.getByRole('dialog', { name: 'Ciao! Questa è la Home' });
    await expect(tour).toBeVisible({ timeout: 15_000 });
    await expect(tour.getByText('Passo 1 di 4')).toBeVisible();
    await expectNoA11yViolations(guestPage);
    await tour.getByRole('button', { name: 'Avanti' }).click();
    await expect(guestPage.getByRole('dialog', { name: 'Progetti = repo' })).toBeVisible();
    await guestPage.getByRole('button', { name: 'Indietro' }).click();
    await guestPage.getByRole('button', { name: 'Salta' }).click();
    await expect(guestPage.getByRole('dialog')).toHaveCount(0);
    await expect(guestPage.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await guestPage.reload();
    await expect(guestPage.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(guestPage.getByRole('dialog')).toHaveCount(0);

    // Members don't see the admin panel.
    await guestPage.goto('/settings');
    await expect(guestPage.getByRole('heading', { name: 'Dispositivi connessi' })).toBeVisible();
    await expect(guestPage.getByRole('heading', { name: 'Admin', exact: true })).toHaveCount(0);
    await guest.close();

    // The same link cannot be used twice.
    const again = await browser.newContext({ baseURL });
    const againPage = await again.newPage();
    await againPage.goto(link);
    await expect(againPage.getByRole('heading', { name: 'Invito non valido' })).toBeVisible();
    await again.close();
  });

  test('admin reset link lets a member choose a new password', async ({
    page,
    browser,
    request,
    baseURL,
  }, info) => {
    const member = await newMember(browser, request, baseURL ?? '', `reset-${info.project.name}`);
    await member.context.close();
    await page.goto('/settings');
    const row = page.getByRole('listitem').filter({ hasText: member.email });
    await row.getByRole('button', { name: 'Link per nuova password' }).click();
    const link = await page.getByRole('textbox', { name: 'Copia link' }).inputValue();

    const fresh = await browser.newContext({ baseURL });
    const resetPage = await fresh.newPage();
    await resetPage.goto(link);
    await expect(resetPage.getByText(member.email)).toBeVisible();
    await resetPage.getByLabel('Nuova password').fill('nuovissima password');
    await resetPage.getByLabel('Ripeti la password').fill('nuovissima password');
    await resetPage.getByRole('button', { name: 'Salva la password' }).click();
    await expect(resetPage.getByText('Password aggiornata')).toBeVisible();
    await resetPage.getByRole('link', { name: 'Vai all’accesso' }).click();
    await resetPage.getByLabel('Email').fill(member.email);
    await resetPage.getByLabel('Password', { exact: true }).fill('nuovissima password');
    await resetPage.getByRole('button', { name: 'Accedi' }).click();
    await expect(resetPage.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await fresh.close();
  });

  test('a member can log out and other devices can be disconnected', async ({
    browser,
    request,
    baseURL,
  }, info) => {
    const member = await newMember(browser, request, baseURL ?? '', `logout-${info.project.name}`);
    const page = await member.context.newPage();
    // A second device for the same member.
    const second = await browser.newContext({ baseURL });
    const secondPage = await second.newPage();
    await secondPage.goto('/login');
    await secondPage.getByLabel('Email').fill(member.email);
    await secondPage.getByLabel('Password', { exact: true }).fill(member.password);
    await secondPage.getByRole('button', { name: 'Accedi' }).click();
    await expect(secondPage.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

    await page.goto('/settings');
    // Sections below the fold mount when the person scrolls to them, like here.
    await page.getByRole('heading', { name: 'Dispositivi connessi' }).scrollIntoViewIfNeeded();
    await expect(page.getByText('Questo dispositivo', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Disconnetti tutti gli altri' }).click();
    await expect(page.getByText('Altri dispositivi disconnessi', { exact: true })).toBeVisible();
    await secondPage.reload();
    await expect(secondPage).toHaveURL(/\/login/);

    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await second.close();
    await member.context.close();
  });
});
