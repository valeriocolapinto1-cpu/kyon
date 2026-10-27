import { expect, expectNoA11yViolations, test } from './fixtures';
import { card, projectWithTasks } from './projects';

test('offline: saved pages and data are readable, writes pause with a clear message', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'tablet', 'phone and desktop cover the two layouts');
  const { context, page, projectId, tag } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    `offline-${info.project.name}`,
  );
  await page.goto(`/progetti?id=${projectId}`);
  await expect(card(page, 'Scrivere il parser')).toBeVisible();
  // Wait for the service worker to control the page, then load once more so the data is saved.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
  });
  await page.reload();
  await expect(card(page, 'Scrivere il parser')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Sei offline' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: `Task ${tag}` })).toBeVisible();
  await expect(card(page, 'Scrivere il parser')).toBeVisible();
  await expectNoA11yViolations(page);

  // A write: ticking a task is refused gently, nothing is lost silently.
  await card(page, 'Scrivere il parser').focus();
  await page.keyboard.press('x');
  await expect(page.getByText('Sei offline: le modifiche sono in pausa.').first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Sei offline' })).toHaveCount(0);
  await context.close();
});
