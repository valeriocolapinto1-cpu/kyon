/**
 * Color math for the design system: WCAG 2.x contrast, sRGB mixing and alpha compositing.
 * Pure functions, no DOM: the theme generator and the contrast tests share them.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Rgba extends Rgb {
  a: number;
}

export function parseHex(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Invalid hex color: ${hex}`);
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function toRgbaCss({ r, g, b, a }: Rgba): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${round(a, 3)})`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: Rgb): number {
  return (
    0.2126 * channelToLinear(color.r) +
    0.7152 * channelToLinear(color.g) +
    0.0722 * channelToLinear(color.b)
  );
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear mix in sRGB: amount 0 returns `a`, 1 returns `b`. */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Composites a translucent color over an opaque backdrop (source-over). */
export function composite(top: Rgba, backdrop: Rgb): Rgb {
  return mix(backdrop, top, top.a);
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255 };
export const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Moves `color` toward `toward` (black or white) in small steps until it reaches `target`
 * contrast against every color in `against`. Returns the least-changed color that passes.
 */
export function adjustForContrast(color: Rgb, against: Rgb[], target: number, toward: Rgb): Rgb {
  for (let step = 0; step <= 100; step++) {
    // Round before checking: the emitted hex must be the color that passes.
    const candidate = roundRgb(mix(color, toward, step / 100));
    if (against.every((bg) => contrastRatio(candidate, bg) >= target)) {
      return candidate;
    }
  }
  return toward;
}

function roundRgb({ r, g, b }: Rgb): Rgb {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}
