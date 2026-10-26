import { expect, newMember, setPreferences, test } from './fixtures';

test.describe('appearance settings', () => {
  test('accent, theme and high contrast apply at once and follow the account', async ({
    browser,
    request,
    baseURL,
  }, info) => {
    // A dedicated account: these changes are saved to the account and must not leak into other tests.
    const member = await newMember(browser, request, baseURL ?? '', `prefs-${info.project.name}`);
    const page = await member.context.newPage();
    await page.addInitScript(() =>
      window.localStorage.setItem('kyon.prefs', JSON.stringify({ theme: 'light' })),
    );
    await page.goto('/settings');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-scheme', 'light');

    await page.getByRole('radio', { name: 'Menta' }).click();
    await expect(html).toHaveAttribute('data-accent', 'mint');
    await page
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Scuro' })
      .click();
    await expect(html).toHaveAttribute('data-scheme', 'dark');
    await page
      .getByRole('radiogroup', { name: 'Alto contrasto' })
      .getByRole('radio', { name: 'Sì' })
      .click();
    await expect(html).toHaveAttribute('data-contrast', 'high');

    // Saved to the account after a short pause.
    await expect
      .poll(
        async () =>
          (
            (await (await page.request.get('/api/me')).json()) as {
              preferences?: { contrast?: string };
            }
          ).preferences?.contrast,
      )
      .toBe('high');

    // Another device: same account, empty local storage → the account's preferences are applied.
    const other = await browser.newContext({
      storageState: await member.context.storageState(),
      baseURL,
    });
    const fresh = await other.newPage();
    await fresh.goto('/');
    const freshHtml = fresh.locator('html');
    await expect(freshHtml).toHaveAttribute('data-accent', 'mint');
    await expect(freshHtml).toHaveAttribute('data-scheme', 'dark');
    await expect(freshHtml).toHaveAttribute('data-contrast', 'high');
    await other.close();
    await member.context.close();
  });

  test('follows the system color scheme and reduced motion by default', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      storageState: 'e2e/.auth/admin.json',
      baseURL,
    });
    const page = await context.newPage();
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-scheme', 'dark');
    await expect(html).toHaveAttribute('data-reduce-motion', 'on');
    await context.close();
  });

  test('segmented controls work with arrow keys', async ({ browser, request, baseURL }, info) => {
    const member = await newMember(browser, request, baseURL ?? '', `keys-${info.project.name}`);
    const page = await member.context.newPage();
    await setPreferences(page, { theme: 'light' });
    await page.goto('/settings');
    const group = page.getByRole('radiogroup', { name: 'Orologio' });
    await group.getByRole('radio', { name: 'Analogico' }).focus();
    // Radix moves focus on a timer and selects only while the arrow is held, like a real key press.
    await page.keyboard.down('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Digitale' })).toBeFocused();
    await page.keyboard.up('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Digitale' })).toBeChecked();
    await member.context.close();
  });
});
