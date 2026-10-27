import { expect, expectNoA11yViolations, newMember, test } from './fixtures';
import { projectWithTasks } from './projects';

test('a mention lights the bell live; opening it leads to the chat and marks it read', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'tablet', 'phone and desktop cover the two bells');
  const base = baseURL ?? '';
  const { context, projectId } = await projectWithTasks(browser, request, base, 'bell');
  const other = await newMember(browser, request, base, `bell-${info.project.name}`);
  const otherMe = (await (await other.context.request.get('/api/me')).json()) as { id: string };
  await context.request.post(`/api/projects/${projectId}/members`, {
    data: { userId: otherMe.id, role: 'member' },
  });
  const otherPage = await other.context.newPage();
  await otherPage.goto('/');
  const bell = otherPage.getByRole('button', { name: /^Notifiche/ }).first();
  await expect(bell).toHaveAccessibleName('Notifiche');

  // The author writes in the project chat with a mention; the bell updates without a reload.
  const room = `project:${projectId}`;
  const sent = await context.request.post(`/api/chat/rooms/${encodeURIComponent(room)}/messages`, {
    data: { clientId: crypto.randomUUID(), body: `Ciao @${other.name}, ci sei?` },
  });
  expect(sent.status()).toBe(201);
  await expect(bell).toHaveAccessibleName('Notifiche, 1 da leggere');

  await bell.click();
  const sheet = otherPage.getByRole('dialog', { name: 'Notifiche' });
  const item = sheet.getByRole('button', { name: /ti ha menzionato/ });
  await expect(item).toContainText(`Ciao @${other.name}, ci sei?`);
  await expectNoA11yViolations(otherPage);
  await item.click();
  await expect(otherPage).toHaveURL(/\/chat\?room=project/);
  await expect(bell).toHaveAccessibleName('Notifiche');
  await context.close();
  await other.context.close();
});

test('notification preferences: matrix and quiet hours are saved', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop' && info.project.name !== 'mobile');
  const member = await newMember(browser, request, baseURL ?? '', `prefs-${info.project.name}`);
  const page = await member.context.newPage();
  await page.goto('/settings#notifications-title');
  const section = page.getByRole('region', { name: 'Notifiche', exact: true });
  const messagesPush = section.getByRole('checkbox', {
    name: 'Push: Nuovi messaggi nelle chat di progetto',
  });
  await expect(messagesPush).not.toBeChecked();
  await messagesPush.check();
  await section.getByLabel('Dalle').fill('22:30');
  await section.getByRole('switch', { name: /menzioni dirette/ }).click();
  // Email can't be sent by the e2e server: its column is disabled, with an explanation.
  await expect(section.getByRole('checkbox', { name: 'Email: Menzioni' })).toBeDisabled();
  await expect(section).toContainText('L’invio email non è attivo');
  await expectNoA11yViolations(page);
  await page.waitForTimeout(500);

  await page.reload();
  await expect(messagesPush).toBeChecked();
  await expect(section.getByLabel('Dalle')).toHaveValue('22:30');
  await expect(section.getByRole('switch', { name: /menzioni dirette/ })).toBeChecked();

  // "Invia una prova" lands in the bell.
  await section.getByRole('button', { name: 'Invia una prova' }).click();
  await expect(page.getByText('Prova inviata').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Notifiche, \d+ da leggere$/ }).first(),
  ).toBeVisible();
  const list = (await (await member.context.request.get('/api/notifications')).json()) as {
    notifications: { title: string }[];
  };
  expect(list.notifications[0]?.title).toBe('Notifica di prova');
  await member.context.close();
});
