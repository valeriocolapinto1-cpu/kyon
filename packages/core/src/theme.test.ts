import { describe, expect, it } from 'vitest';
import { contrastRatio, type Rgb } from './color';
import {
  ACCENT_IDS,
  allThemeInputs,
  buildTheme,
  buildThemeCss,
  nonTextTarget,
  textTarget,
} from './theme';

const min = (color: Rgb, backdrops: Rgb[]) =>
  Math.min(...backdrops.map((bg) => contrastRatio(color, bg)));

describe('theme contrast (accent × scheme × contrast)', () => {
  it('covers 11 accents × 2 schemes × 2 contrast modes', () => {
    expect(ACCENT_IDS).toHaveLength(11);
    expect(allThemeInputs()).toHaveLength(44);
  });

  for (const input of allThemeInputs()) {
    const label = `${input.accent}/${input.scheme}/${input.contrast}`;
    const theme = buildTheme(input);
    const target = textTarget(input.contrast);

    it(`${label}: text tokens pass on every content backdrop`, () => {
      for (const [name, color] of Object.entries(theme.text)) {
        expect(min(color, theme.backdrops.content), `${name}`).toBeGreaterThanOrEqual(target);
      }
    });

    it(`${label}: primary text and accent text pass on floating chrome`, () => {
      expect(min(theme.text.text, theme.backdrops.chrome)).toBeGreaterThanOrEqual(target);
      expect(min(theme.text.accentText, theme.backdrops.chrome)).toBeGreaterThanOrEqual(target);
    });

    it(`${label}: button labels pass on their fills`, () => {
      for (const [name, { fill, on }] of Object.entries(theme.fills)) {
        expect(contrastRatio(fill, on), `${name}`).toBeGreaterThanOrEqual(target);
      }
    });

    it(`${label}: focus ring and input borders are visible (non-text contrast)`, () => {
      expect(min(theme.focus, theme.backdrops.chrome)).toBeGreaterThanOrEqual(
        nonTextTarget(input.contrast),
      );
      expect(min(theme.inputBorder, theme.backdrops.content)).toBeGreaterThanOrEqual(
        nonTextTarget(input.contrast),
      );
    });
  }

  it('keeps the original accent as decorative fill and derives a darker text variant on light', () => {
    const theme = buildTheme({ accent: 'yellow', scheme: 'light', contrast: 'normal' });
    expect(theme.tokens['accent']).toBe('#FFCC00');
    expect(theme.tokens['accent-text']).not.toBe('#FFCC00');
    expect(theme.tokens['on-accent']).toBe('#000000');
  });

  it('generates one CSS block per combination', () => {
    const css = buildThemeCss();
    expect(css.match(/:root\[data-accent=/g)).toHaveLength(44);
    expect(css).toContain('--k-accent-text:');
  });
});
