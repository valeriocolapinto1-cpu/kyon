import {
  BLACK,
  WHITE,
  adjustForContrast,
  composite,
  luminance,
  mix,
  parseHex,
  toHex,
  toRgbaCss,
  type Rgb,
  type Rgba,
} from './color';

/** Apple system colors, in Apple's own order. Light and dark variants from the HIG. */
export const ACCENTS = {
  red: { light: '#FF3B30', dark: '#FF453A' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  yellow: { light: '#FFCC00', dark: '#FFD60A' },
  green: { light: '#34C759', dark: '#30D158' },
  mint: { light: '#00C7BE', dark: '#63E6E2' },
  teal: { light: '#30B0C7', dark: '#40C8E0' },
  cyan: { light: '#32ADE6', dark: '#64D2FF' },
  blue: { light: '#007AFF', dark: '#0A84FF' },
  indigo: { light: '#5856D6', dark: '#5E5CE6' },
  purple: { light: '#AF52DE', dark: '#BF5AF2' },
  pink: { light: '#FF2D55', dark: '#FF375F' },
} as const;

export type AccentId = keyof typeof ACCENTS;
export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];
export const DEFAULT_ACCENT: AccentId = 'blue';

export type Scheme = 'light' | 'dark';
export type ContrastMode = 'normal' | 'high';

/** Minimum contrast for text (WCAG AA normal text; AAA in high contrast mode). */
export function textTarget(contrast: ContrastMode): number {
  return contrast === 'high' ? 7 : 4.5;
}

/** Minimum contrast for non-text UI such as focus rings and input borders (WCAG 1.4.11). */
export function nonTextTarget(contrast: ContrastMode): number {
  return contrast === 'high' ? 4.5 : 3;
}

export interface ThemeInput {
  accent: AccentId;
  scheme: Scheme;
  contrast: ContrastMode;
}

/** Every opaque color text can end up on, used both to derive tokens and to test them. */
export interface ThemeBackdrops {
  /** Card-level text: page background, mesh stops and glass surfaces composited over them. */
  content: Rgb[];
  /** Floating chrome (tab bar, sidebar, sheets) can sit over any content, including pure black/white. */
  chrome: Rgb[];
}

export interface Theme {
  input: ThemeInput;
  tokens: Record<string, string>;
  backdrops: ThemeBackdrops;
  /** Opaque values of the text tokens, for contrast checks. */
  text: Record<
    'text' | 'textMuted' | 'accentText' | 'successText' | 'warningText' | 'dangerText',
    Rgb
  >;
  /** Fill/on-fill pairs for buttons and badges. */
  fills: Record<'accent' | 'danger' | 'success', { fill: Rgb; on: Rgb }>;
  focus: Rgb;
  inputBorder: Rgb;
}

const BASE = {
  light: {
    bg: '#F2F2F7',
    surface: '#FFFFFF',
    text: '#1C1C1E',
    textHigh: '#000000',
    muted: '#6E6E73',
  },
  dark: {
    bg: '#0B0B0F',
    surface: '#2C2C30',
    text: '#F2F2F7',
    textHigh: '#FFFFFF',
    muted: '#A1A1A6',
  },
} as const;

const ALPHA = {
  normal: { surface: 0.62, chrome: 0.86 },
  high: { surface: 1, chrome: 1 },
} as const;

/** Builds every design token for one accent × scheme × contrast combination. */
export function buildTheme(input: ThemeInput): Theme {
  const { accent, scheme, contrast } = input;
  const base = BASE[scheme];
  const bg = parseHex(base.bg);
  const accentRaw = parseHex(ACCENTS[accent][scheme]);
  const neighbor = parseHex(ACCENTS[neighborAccent(accent)][scheme]);
  const surfaceRgb = parseHex(base.surface);
  const alpha = ALPHA[contrast];
  const surface: Rgba = { ...surfaceRgb, a: alpha.surface };
  const chrome: Rgba = { ...surfaceRgb, a: alpha.chrome };

  // Static mesh: soft tints of the accent and its neighbor. Flat in high contrast mode.
  const strength = scheme === 'light' ? [0.4, 0.28, 0.2] : [0.5, 0.36, 0.26];
  const mesh: Rgb[] =
    contrast === 'high'
      ? [bg, bg, bg]
      : [
          mix(bg, accentRaw, strength[0] ?? 0),
          mix(bg, neighbor, strength[1] ?? 0),
          mix(bg, accentRaw, strength[2] ?? 0),
        ];

  // Soft tints used behind badge text (accent-soft, neutral-soft) count as backdrops too.
  const accentSoft: Rgba = { ...accentRaw, a: scheme === 'light' ? 0.14 : 0.24 };
  const awayFromBgEarly = scheme === 'light' ? BLACK : WHITE;
  const neutralSoft: Rgba = { ...awayFromBgEarly, a: scheme === 'light' ? 0.06 : 0.12 };
  const glassBackdrops = [bg, ...mesh].map((m) => composite(surface, m));
  const content = [
    bg,
    ...mesh,
    ...glassBackdrops,
    ...[bg, ...glassBackdrops].flatMap((b) => [
      composite(accentSoft, b),
      composite(neutralSoft, b),
    ]),
  ];
  const chromeBackdrops = [
    ...content,
    ...[WHITE, BLACK, bg, ...mesh].map((m) => composite(chrome, m)),
  ];
  const awayFromBg = awayFromBgEarly;
  const target = textTarget(contrast);

  const text = adjustForContrast(
    parseHex(contrast === 'high' ? base.textHigh : base.text),
    chromeBackdrops,
    target,
    awayFromBg,
  );
  const textMuted = adjustForContrast(parseHex(base.muted), content, target, awayFromBg);
  const deriveText = (raw: Rgb) => adjustForContrast(raw, chromeBackdrops, target, awayFromBg);
  const accentText = deriveText(accentRaw);
  const successText = deriveText(parseHex(ACCENTS.green[scheme]));
  const warningText = deriveText(parseHex(ACCENTS.orange[scheme]));
  const dangerText = deriveText(parseHex(ACCENTS.red[scheme]));

  const accentFill = deriveFill(accentRaw, target);
  const dangerFill = deriveFill(parseHex(ACCENTS.red[scheme]), target);
  const successFill = deriveFill(parseHex(ACCENTS.green[scheme]), target);

  const focus = adjustForContrast(accentRaw, chromeBackdrops, nonTextTarget(contrast), awayFromBg);
  const inputBorder = adjustForContrast(
    mix(surfaceRgb, awayFromBg, 0.3),
    content,
    nonTextTarget(contrast),
    awayFromBg,
  );

  const hex = toHex;
  const tokens: Record<string, string> = {
    bg: hex(bg),
    'mesh-1': hex(mesh[0] ?? bg),
    'mesh-2': hex(mesh[1] ?? bg),
    'mesh-3': hex(mesh[2] ?? bg),
    surface: toRgbaCss(surface),
    'surface-solid': hex(composite(surface, bg)),
    chrome: toRgbaCss(chrome),
    'chrome-solid': hex(composite(chrome, bg)),
    text: hex(text),
    'text-muted': hex(textMuted),
    separator: toRgbaCss({ ...awayFromBg, a: contrast === 'high' ? 0.5 : 0.12 }),
    border:
      contrast === 'high'
        ? hex(inputBorder)
        : toRgbaCss({ ...WHITE, a: scheme === 'light' ? 0.8 : 0.2 }),
    'input-border': hex(inputBorder),
    accent: hex(accentRaw),
    'accent-text': hex(accentText),
    'accent-fill': hex(accentFill.fill),
    'on-accent': hex(accentFill.on),
    'accent-soft': toRgbaCss(accentSoft),
    'neutral-soft': toRgbaCss(neutralSoft),
    focus: hex(focus),
    'success-text': hex(successText),
    'warning-text': hex(warningText),
    'danger-text': hex(dangerText),
    'danger-fill': hex(dangerFill.fill),
    'on-danger': hex(dangerFill.on),
    'success-fill': hex(successFill.fill),
    'on-success': hex(successFill.on),
    'shadow-alpha': scheme === 'light' ? '0.10' : '0.45',
    specular: scheme === 'light' ? 'rgb(255 255 255 / 0.9)' : 'rgb(255 255 255 / 0.32)',
  };

  return {
    input,
    tokens,
    backdrops: { content, chrome: chromeBackdrops },
    text: { text, textMuted, accentText, successText, warningText, dangerText },
    fills: { accent: accentFill, danger: dangerFill, success: successFill },
    focus,
    inputBorder,
  };
}

/**
 * Button fill: light accents (yellow, mint, ...) keep dark text, dark ones keep white text.
 * The fill is then nudged (lighter or darker) until the label reaches the target contrast.
 */
function deriveFill(raw: Rgb, target: number): { fill: Rgb; on: Rgb } {
  const darkLabel = luminance(raw) > 0.3;
  const on = darkLabel ? BLACK : WHITE;
  const fill = adjustForContrast(raw, [on], target, darkLabel ? WHITE : BLACK);
  return { fill, on };
}

function neighborAccent(accent: AccentId): AccentId {
  const index = ACCENT_IDS.indexOf(accent);
  return ACCENT_IDS[(index + 2) % ACCENT_IDS.length] ?? accent;
}

/** All 44 combinations, in a stable order. */
export function allThemeInputs(): ThemeInput[] {
  const inputs: ThemeInput[] = [];
  for (const accent of ACCENT_IDS) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const contrast of ['normal', 'high'] as const) {
        inputs.push({ accent, scheme, contrast });
      }
    }
  }
  return inputs;
}

/**
 * CSS for every theme, keyed by data attributes on <html>:
 * data-accent, data-scheme (resolved light/dark) and data-contrast.
 */
export function buildThemeCss(): string {
  const blocks = allThemeInputs().map((input) => {
    const { tokens } = buildTheme(input);
    const selector = `:root[data-accent='${input.accent}'][data-scheme='${input.scheme}'][data-contrast='${input.contrast}']`;
    const body = Object.entries(tokens)
      .map(([name, value]) => `  --k-${name}: ${value};`)
      .join('\n');
    return `${selector} {\n${body}\n}`;
  });
  return `/* Generated by scripts/gen-theme.ts from packages/core/src/theme.ts. Do not edit. */\n\n${blocks.join('\n\n')}\n`;
}
