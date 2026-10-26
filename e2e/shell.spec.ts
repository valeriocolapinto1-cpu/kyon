import { PAGES, expect, expectNoA11yViolations, setPreferences, test } from './fixtures';

test.describe('shell', () => {
  test('navigates between the four sections and moves focus to the title', async ({ page }) => {
    await setPreferences(page, {});
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    const nav = page
      .getByRole('navigation', { name: 'Navigazione principale' })
      .filter({ visible: true });

    for (const target of PAGES.slice(1)) {
      await nav.getByRole('link', { name: target.title, exact: true }).click();
      await expect(page).toHaveURL(target.path);
      const heading = page.getByRole('heading', { level: 1, name: target.title });
      await expect(heading).toBeFocused();
      await expect(nav.getByRole('link', { name: target.title, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test('skip link jumps to the content', async ({ page }) => {
    await setPreferences(page, {});
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Vai al contenuto' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenuto')).toBeFocused();
  });

  test('command palette opens with Ctrl+K and navigates', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Keyboard shortcut is a desktop feature');
    await setPreferences(page, {});
    await page.goto('/');
    await page.getByRole('heading', { level: 1, name: 'Home' }).waitFor();
    await page.keyboard.press('Control+k');
    const input = page.getByPlaceholder('Cerca o scrivi un comando…');
    await expect(input).toBeVisible();
    await input.fill('chat');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/chat');
  });
});

test.describe('accessibility (axe)', () => {
  const modes = [
    { name: 'light', prefs: { theme: 'light' as const } },
    { name: 'dark', prefs: { theme: 'dark' as const } },
    { name: 'high contrast', prefs: { theme: 'light' as const, contrast: 'high' as const } },
    {
      name: 'dark high contrast yellow',
      prefs: { theme: 'dark' as const, contrast: 'high' as const, accent: 'yellow' as const },
    },
  ];
  for (const mode of modes) {
    for (const target of PAGES) {
      test(`${target.title} in ${mode.name}`, async ({ page }) => {
        await setPreferences(page, { ...mode.prefs, reduceMotion: 'on' });
        await page.goto(target.path);
        await page.getByRole('heading', { level: 1, name: target.title }).waitFor();
        await expectNoA11yViolations(page);
      });
    }
  }

  test('design system gallery', async ({ page }) => {
    await setPreferences(page, { reduceMotion: 'on' });
    await page.goto('/dev/ui');
    await page.getByRole('heading', { level: 1, name: 'Design system' }).waitFor();
    await expectNoA11yViolations(page);
  });
});
