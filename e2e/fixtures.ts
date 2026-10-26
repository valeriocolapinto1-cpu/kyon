import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request as playwrightRequest,
  test as base,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { deriveClientKey, type Preferences } from '@kyon/core';

export const E2E_BOOTSTRAP = 'e2e-bootstrap-code-kyon';
export const ADMIN = {
  name: 'Valerio',
  email: 'valerio@kyon.test',
  password: 'password admin e2e',
};

export const PAGES = [
  { path: '/', title: 'Home' },
  { path: '/progetti', title: 'Progetti' },
  { path: '/chat', title: 'Chat' },
  { path: '/settings', title: 'Settings' },
] as const;

/** Stores preferences before any page script runs (as if chosen in Settings). */
export async function setPreferences(page: Page, prefs: Partial<Preferences>) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('kyon.prefs', JSON.stringify(value));
    // Skip automatic lite detection: deterministic rendering in tests.
    window.localStorage.setItem('kyon.lite-detected', '0');
  }, prefs);
}

/** Fails on serious and critical WCAG 2.x A/AA violations. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

let memberCounter = 0;

/**
 * Invites and signs up a brand-new member through the API (admin cookies come from the project's
 * storage state), then returns a browser context logged in as that member.
 */
export async function newMember(
  browser: Browser,
  adminRequest: APIRequestContext,
  baseURL: string,
  tag: string,
) {
  memberCounter += 1;
  const email = `${tag}-${Date.now()}-${memberCounter}@kyon.test`.toLowerCase();
  const password = 'password membro e2e';
  // Unique across parallel workers: the group chat lists everyone, names must not collide.
  const name = `Membro ${memberCounter}${Math.random().toString(36).slice(2, 5)}`;
  const invite = await adminRequest.post('/api/admin/invites', { data: { note: name } });
  expect(invite.status()).toBe(201);
  const { code, url } = (await invite.json()) as { code: string; url: string };
  const api = await playwrightRequest.newContext({ baseURL });
  const joined = await api.post('/api/join', {
    data: { code, name, email, key: await deriveClientKey(email, password) },
  });
  expect(joined.status()).toBe(200);
  const storageState = await api.storageState();
  await api.dispose();
  const context = await browser.newContext({ storageState, baseURL });
  await context.addInitScript(() => window.localStorage.setItem('kyon.lite-detected', '0'));
  return { context, email, password, name, inviteUrl: url };
}

export const FAKE_GITHUB = 'http://localhost:8799';

/** OAuth against the fake GitHub, from Settings. */
export async function connectGitHub(page: Page, login: string) {
  await page.goto('/settings#github');
  await page.getByRole('link', { name: 'Collega GitHub' }).click();
  // Fake GitHub consent page.
  await page.getByRole('link', { name: `Autorizza come ${login}` }).click();
  await expect(page.getByText(`Collegato come ${login}`)).toBeVisible();
}

export const test = base;
export { expect };
