import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import type { Preferences } from '@kyon/core';

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

export const test = base;
export { expect };
