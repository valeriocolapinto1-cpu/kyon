import { expect, setPreferences, test } from './fixtures';

test.describe('appearance settings', () => {
  test('accent, theme and high contrast apply immediately and survive a reload', async ({
    page,
  }) => {
    await setPreferences(page, { theme: 'light' });
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

    // addInitScript would reset storage on reload: read what the app saved, then reload without it.
    const saved = await page.evaluate(() => window.localStorage.getItem('kyon.prefs'));
    const fresh = await page.context().newPage();
    await fresh.addInitScript(
      (value) => window.localStorage.setItem('kyon.prefs', value ?? '{}'),
      saved,
    );
    await fresh.goto('/');
    const freshHtml = fresh.locator('html');
    await expect(freshHtml).toHaveAttribute('data-accent', 'mint');
    await expect(freshHtml).toHaveAttribute('data-scheme', 'dark');
    await expect(freshHtml).toHaveAttribute('data-contrast', 'high');
  });

  test('follows the system color scheme and reduced motion by default', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-scheme', 'dark');
    await expect(html).toHaveAttribute('data-reduce-motion', 'on');
    await context.close();
  });

  test('segmented controls work with arrow keys', async ({ page }) => {
    await setPreferences(page, { theme: 'light' });
    await page.goto('/settings');
    const group = page.getByRole('radiogroup', { name: 'Orologio' });
    await group.getByRole('radio', { name: 'Analogico' }).focus();
    // Radix moves focus on a timer and selects only while the arrow is held, like a real key press.
    await page.keyboard.down('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Digitale' })).toBeFocused();
    await page.keyboard.up('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Digitale' })).toBeChecked();
  });
});
