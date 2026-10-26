import { ACCENT_IDS, DEFAULT_ACCENT, type AccentId } from './theme';

/** Per-user look & accessibility preferences (Settings → Grafica / Accessibilità). */
export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  accent: AccentId;
  contrast: 'system' | 'normal' | 'high';
  reduceTransparency: 'system' | 'on' | 'off';
  reduceMotion: 'system' | 'on' | 'off';
  lite: 'auto' | 'on' | 'off';
  /** 'system' follows the OS text size; otherwise a multiplier. */
  textScale: 'system' | number;
  nonColor: boolean;
  clockStyle: 'analog' | 'digital';
  announceMessages: boolean;
  announceLive: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  accent: DEFAULT_ACCENT,
  contrast: 'system',
  reduceTransparency: 'system',
  reduceMotion: 'system',
  lite: 'auto',
  textScale: 'system',
  nonColor: false,
  clockStyle: 'analog',
  announceMessages: true,
  announceLive: true,
};

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.6;

/** What the browser reports (media queries + automatic lite detection). */
export interface Environment {
  prefersDark: boolean;
  prefersContrastMore: boolean;
  prefersReducedMotion: boolean;
  prefersReducedTransparency: boolean;
  liteDetected: boolean;
}

export type HtmlAttributes = Record<string, string>;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Accepts anything (localStorage, JSON from D1) and returns valid preferences. Unknown fields are dropped. */
export function sanitizePreferences(raw: unknown): Preferences {
  const v = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  const scale =
    typeof v.textScale === 'number' && Number.isFinite(v.textScale)
      ? Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, v.textScale))
      : 'system';
  return {
    theme: pick(v.theme, ['system', 'light', 'dark'], d.theme),
    accent: pick(v.accent, ACCENT_IDS, d.accent),
    contrast: pick(v.contrast, ['system', 'normal', 'high'], d.contrast),
    reduceTransparency: pick(v.reduceTransparency, ['system', 'on', 'off'], d.reduceTransparency),
    reduceMotion: pick(v.reduceMotion, ['system', 'on', 'off'], d.reduceMotion),
    lite: pick(v.lite, ['auto', 'on', 'off'], d.lite),
    textScale: scale,
    nonColor: typeof v.nonColor === 'boolean' ? v.nonColor : d.nonColor,
    clockStyle: pick(v.clockStyle, ['analog', 'digital'], d.clockStyle),
    announceMessages:
      typeof v.announceMessages === 'boolean' ? v.announceMessages : d.announceMessages,
    announceLive: typeof v.announceLive === 'boolean' ? v.announceLive : d.announceLive,
  };
}

const onOff = (setting: 'system' | 'on' | 'off', system: boolean) =>
  setting === 'on' || (setting === 'system' && system) ? 'on' : 'off';

/** Resolves preferences + environment into the data attributes set on <html>. */
export function resolveHtmlAttributes(prefs: Preferences, env: Environment): HtmlAttributes {
  const scheme = prefs.theme === 'system' ? (env.prefersDark ? 'dark' : 'light') : prefs.theme;
  const contrast =
    prefs.contrast === 'system' ? (env.prefersContrastMore ? 'high' : 'normal') : prefs.contrast;
  const attrs: HtmlAttributes = {
    'data-accent': prefs.accent,
    'data-scheme': scheme,
    'data-contrast': contrast,
    'data-reduce-motion': onOff(prefs.reduceMotion, env.prefersReducedMotion),
    'data-reduce-transparency': onOff(prefs.reduceTransparency, env.prefersReducedTransparency),
    'data-lite': prefs.lite === 'on' || (prefs.lite === 'auto' && env.liteDetected) ? 'on' : 'off',
    'data-non-color': prefs.nonColor ? 'on' : 'off',
  };
  if (prefs.textScale !== 'system') attrs['data-text-scale'] = String(prefs.textScale);
  return attrs;
}
