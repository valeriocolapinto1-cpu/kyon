import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  resolveHtmlAttributes,
  sanitizePreferences,
  type Environment,
} from './preferences';

const env: Environment = {
  prefersDark: false,
  prefersContrastMore: false,
  prefersReducedMotion: false,
  prefersReducedTransparency: false,
  liteDetected: false,
};

describe('sanitizePreferences', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ accent: 'chartreuse', theme: 3 })).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid values and clamps the text scale', () => {
    const prefs = sanitizePreferences({ accent: 'mint', theme: 'dark', textScale: 9, extra: true });
    expect(prefs.accent).toBe('mint');
    expect(prefs.theme).toBe('dark');
    expect(prefs.textScale).toBe(1.6);
    expect(prefs).not.toHaveProperty('extra');
  });
});

describe('resolveHtmlAttributes', () => {
  it('follows the system by default', () => {
    const attrs = resolveHtmlAttributes(DEFAULT_PREFERENCES, {
      ...env,
      prefersDark: true,
      prefersContrastMore: true,
      prefersReducedMotion: true,
      prefersReducedTransparency: true,
    });
    expect(attrs).toMatchObject({
      'data-scheme': 'dark',
      'data-contrast': 'high',
      'data-reduce-motion': 'on',
      'data-reduce-transparency': 'on',
      'data-lite': 'off',
    });
    expect(attrs).not.toHaveProperty('data-text-scale');
  });

  it('lets explicit settings override the system', () => {
    const attrs = resolveHtmlAttributes(
      {
        ...DEFAULT_PREFERENCES,
        theme: 'light',
        reduceMotion: 'off',
        contrast: 'normal',
        textScale: 1.2,
      },
      { ...env, prefersDark: true, prefersReducedMotion: true, prefersContrastMore: true },
    );
    expect(attrs['data-scheme']).toBe('light');
    expect(attrs['data-reduce-motion']).toBe('off');
    expect(attrs['data-contrast']).toBe('normal');
    expect(attrs['data-text-scale']).toBe('1.2');
  });

  it('turns lite mode on when detected automatically, unless forced off', () => {
    expect(
      resolveHtmlAttributes(DEFAULT_PREFERENCES, { ...env, liteDetected: true })['data-lite'],
    ).toBe('on');
    expect(
      resolveHtmlAttributes(
        { ...DEFAULT_PREFERENCES, lite: 'off' },
        { ...env, liteDetected: true },
      )['data-lite'],
    ).toBe('off');
  });
});
