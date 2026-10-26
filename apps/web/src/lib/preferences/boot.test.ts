import { describe, expect, it } from 'vitest';
import {
  ACCENT_IDS,
  DEFAULT_PREFERENCES,
  resolveHtmlAttributes,
  sanitizePreferences,
  type Environment,
} from '@kyon/core';
import { BOOT_SCRIPT } from './boot';

function runBoot(stored: unknown, env: Environment) {
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const storage: Record<string, string> = {
    'kyon.prefs': JSON.stringify(stored),
    'kyon.lite-detected': env.liteDetected ? '1' : '0',
  };
  const queries: Record<string, boolean> = {
    '(prefers-color-scheme: dark)': env.prefersDark,
    '(prefers-contrast: more)': env.prefersContrastMore,
    '(prefers-reduced-motion: reduce)': env.prefersReducedMotion,
    '(prefers-reduced-transparency: reduce)': env.prefersReducedTransparency,
  };
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      style: { setProperty: (k: string, v: string) => (style[k] = v) },
    },
  };
  const window = { matchMedia: (q: string) => ({ matches: queries[q] ?? false }) };
  const localStorage = { getItem: (k: string) => storage[k] ?? null };
  new Function('document', 'window', 'localStorage', BOOT_SCRIPT)(document, window, localStorage);
  return { attrs, style };
}

const envs: Environment[] = [
  {
    prefersDark: false,
    prefersContrastMore: false,
    prefersReducedMotion: false,
    prefersReducedTransparency: false,
    liteDetected: false,
  },
  {
    prefersDark: true,
    prefersContrastMore: true,
    prefersReducedMotion: true,
    prefersReducedTransparency: true,
    liteDetected: true,
  },
];

const samples: unknown[] = [
  {},
  null,
  { theme: 'dark', accent: 'mint', contrast: 'high', lite: 'on', textScale: 1.3, nonColor: true },
  {
    theme: 'light',
    accent: 'nope',
    reduceMotion: 'off',
    reduceTransparency: 'on',
    lite: 'off',
    textScale: 99,
  },
  ...ACCENT_IDS.map((accent) => ({ accent })),
];

describe('BOOT_SCRIPT', () => {
  it('uses the same defaults as @kyon/core', () => {
    expect(BOOT_SCRIPT).toContain(JSON.stringify(DEFAULT_PREFERENCES));
    expect(BOOT_SCRIPT).toContain(JSON.stringify(ACCENT_IDS));
  });

  for (const env of envs) {
    for (const stored of samples) {
      it(`matches resolveHtmlAttributes for ${JSON.stringify(stored)} / dark=${env.prefersDark}`, () => {
        const { attrs, style } = runBoot(stored, env);
        expect(attrs).toEqual(resolveHtmlAttributes(sanitizePreferences(stored), env));
        if (attrs['data-text-scale'])
          expect(style['--k-text-scale']).toBe(attrs['data-text-scale']);
      });
    }
  }
});
