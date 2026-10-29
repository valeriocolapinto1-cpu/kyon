import { expect, expectNoA11yViolations, test } from './fixtures';
import { projectWithTasks } from './projects';

test('projects: picking one shows its overview first, "Entra nel progetto" opens it', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const { context, page, projectId } = await projectWithTasks(
    browser,
    request,
    baseURL ?? '',
    info.project.name,
  );
  await page.goto('/progetti');
  await page
    .getByRole('link', { name: /^Task / })
    .first()
    .click();

  // Still on the list page: the side panel carries the overview and the way in.
  await expect(page).toHaveURL(/\/progetti\?sel=/);
  const enter = page.getByRole('link', { name: 'Entra nel progetto' });
  await expect(enter).toBeVisible();
  await expect(page.getByText('Aperte', { exact: true })).toBeVisible();
  await expectNoA11yViolations(page);

  await enter.click();
  await expect(page).toHaveURL(new RegExp(`/progetti\\?id=${projectId}`));
  await expect(page.getByRole('tab', { name: 'Task' })).toBeVisible();
  await context.close();
});
