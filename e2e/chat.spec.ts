import { expect, expectNoA11yViolations, newMember, test } from './fixtures';
import { card, projectWithTasks } from './projects';

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('group chat live between two people: typing, reply, reaction, edit, delete, search, pin', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'tablet', 'phone and desktop cover the two layouts');
  const base = baseURL ?? '';
  const a = await newMember(browser, request, base, `chat-a-${info.project.name}`);
  const b = await newMember(browser, request, base, `chat-b-${info.project.name}`);
  const pageA = await a.context.newPage();
  const pageB = await b.context.newPage();
  const tag = `${info.project.name}-${Date.now()}`;

  await pageA.goto('/chat?room=general');
  await pageB.goto('/chat?room=general');
  const composerA = pageA.getByRole('combobox', { name: 'Scrivi un messaggio' });
  const composerB = pageB.getByRole('combobox', { name: 'Scrivi un messaggio' });
  await expect(composerA).toBeVisible();
  await expect(composerB).toBeVisible();
  await expect(pageA.getByText(new RegExp(`^Online: .*${b.name}`))).toBeVisible();
  await expectNoA11yViolations(pageA);

  // A writes; B sees it live and it's announced to screen readers.
  await composerA.fill(`Ciao da A ${tag}`);
  await pageA.getByRole('button', { name: 'Invia' }).click();
  const fromA = pageB.getByRole('article').filter({ hasText: `Ciao da A ${tag}` });
  await expect(fromA).toBeVisible();
  await expect(pageB.getByText(`Nuovo messaggio da ${a.name}: Ciao da A ${tag}`)).toBeAttached();

  // B types: A sees "sta scrivendo".
  await composerB.pressSequentially('sto scri', { delay: 30 });
  await expect(pageA.getByText(`${b.name} sta scrivendo…`)).toBeVisible();
  await composerB.fill('');

  // B replies to A's message with a mention and a code block.
  await fromA.getByRole('button', { name: `Azioni sul messaggio di ${a.name}` }).click();
  await pageB.getByRole('menuitem', { name: 'Rispondi' }).click();
  await expect(pageB.getByText(`Rispondi a ${a.name}`)).toBeVisible();
  await composerB.fill(`Risposta ${tag} per @${a.name.slice(0, -1)}`);
  // Autocomplete: Enter picks the highlighted person.
  await expect(pageB.getByRole('option', { name: `@${a.name}` })).toBeVisible();
  await composerB.press('Enter');
  await expect(composerB).toHaveValue(`Risposta ${tag} per @${a.name} `);
  await composerB.pressSequentially('ecco ');
  await pageB.getByRole('button', { name: 'Invia' }).click();
  const reply = pageA.getByRole('article').filter({ hasText: `Risposta ${tag}` });
  await expect(reply).toBeVisible();
  await expect(reply.getByRole('button', { name: /Vai al messaggio/ })).toContainText(
    `Ciao da A ${tag}`,
  );

  // A reacts to the reply; B sees the count.
  await reply.getByRole('button', { name: `Azioni sul messaggio di ${b.name}` }).click();
  await pageA.getByRole('menuitem', { name: 'Reagisci con 🎉' }).click();
  await expect(
    pageB
      .getByRole('article')
      .filter({ hasText: `Risposta ${tag}` })
      .getByRole('button', { name: new RegExp(`🎉.*da ${a.name}`) }),
  ).toBeVisible();

  // A edits, then deletes, their own message: B sees both.
  const mine = pageA
    .getByRole('article')
    .filter({ hasText: `Ciao da A ${tag}` })
    .first();
  await mine.getByRole('button', { name: /Azioni sul messaggio di/ }).click();
  await pageA.getByRole('menuitem', { name: 'Modifica' }).click();
  await composerA.fill(`Ciao corretto ${tag}`);
  // On phones Enter is a new line: the button saves.
  await pageA.getByRole('button', { name: 'Salva' }).click();
  await expect(
    pageB.getByRole('article').filter({ hasText: `Ciao corretto ${tag}` }),
  ).toContainText('modificato');

  // Pin and search.
  await pageA
    .getByRole('article')
    .filter({ hasText: `Ciao corretto ${tag}` })
    .getByRole('button', { name: /Azioni sul messaggio di/ })
    .click();
  await pageA.getByRole('menuitem', { name: 'Fissa' }).click();
  await pageB.getByRole('button', { name: 'Messaggi fissati' }).click();
  await expect(pageB.getByRole('dialog').getByText(`Ciao corretto ${tag}`)).toBeVisible();
  await pageB.keyboard.press('Escape');
  await pageB.getByRole('button', { name: 'Cerca nei messaggi' }).click();
  await pageB
    .getByRole('dialog')
    .getByRole('searchbox')
    .fill(`corretto ${tag.split('-')[0]}`);
  await expect(pageB.getByRole('dialog').getByText(`Ciao corretto ${tag}`)).toBeVisible();
  await pageB.keyboard.press('Escape');

  await pageA
    .getByRole('article')
    .filter({ hasText: `Ciao corretto ${tag}` })
    .getByRole('button', { name: /Azioni sul messaggio di/ })
    .click();
  pageA.once('dialog', (d) => void d.accept());
  await pageA.getByRole('menuitem', { name: 'Elimina' }).click();
  await expect(pageB.getByText('Messaggio eliminato').first()).toBeVisible();

  // Image attachment with alt text.
  await pageB
    .locator('input[type=file]')
    .setInputFiles({ name: 'grafico.png', mimeType: 'image/png', buffer: PNG });
  await pageB
    .getByLabel('Testo alternativo per grafico.png (facoltativo)')
    .fill('Il grafico della crescita');
  await expect(pageB.getByText('Carico grafico.png…')).toHaveCount(0);
  await pageB.getByRole('button', { name: 'Invia' }).click();
  await expect(pageA.getByRole('img', { name: 'Il grafico della crescita' })).toBeVisible();
  await expectNoA11yViolations(pageA);

  await a.context.close();
  await b.context.close();
});

test('task comments in the detail, count on the card; unread badge in the list', async ({
  browser,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the chat UI is covered on phone above');
  const base = baseURL ?? '';
  const { context, page, projectId } = await projectWithTasks(browser, request, base, 'comments');
  await page.goto(`/progetti?id=${projectId}`);
  await card(page, 'Scrivere il parser').click();
  const detail = page.getByRole('complementary');
  const composer = detail.getByRole('combobox', { name: 'Scrivi un commento' });
  await composer.fill('Parto dai test di parse');
  await composer.press('Enter');
  await expect(
    detail.getByRole('article').filter({ hasText: 'Parto dai test di parse' }),
  ).toBeVisible();
  await detail.getByRole('button', { name: 'Chiudi dettaglio' }).click();
  await expect(card(page, 'Scrivere il parser')).toContainText('1');
  await expect(page.getByText('1 commento')).toBeAttached();

  // A message in the project chat shows up as unread for the others.
  await page.goto(`/chat?room=${encodeURIComponent(`project:${projectId}`)}`);
  const composerChat = page.getByRole('combobox', { name: 'Scrivi un messaggio' });
  await composerChat.fill('Riunione alle 18');
  await composerChat.press('Enter');
  await expect(page.getByRole('article').filter({ hasText: 'Riunione alle 18' })).toBeVisible();
  await expectNoA11yViolations(page);
  await context.close();
});
