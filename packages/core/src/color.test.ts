import { describe, expect, it } from 'vitest';
import {
  BLACK,
  WHITE,
  adjustForContrast,
  composite,
  contrastRatio,
  mix,
  parseHex,
  toHex,
} from './color';

describe('color math', () => {
  it('matches the WCAG reference ratios', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    // #777777 on white is the classic "just below AA" example.
    expect(contrastRatio(parseHex('#777777'), WHITE)).toBeCloseTo(4.48, 2);
  });

  it('round-trips hex', () => {
    expect(toHex(parseHex('#0a84ff'))).toBe('#0A84FF');
    expect(() => parseHex('blue')).toThrow();
  });

  it('mixes and composites in sRGB', () => {
    expect(toHex(mix(BLACK, WHITE, 0.5))).toBe('#808080');
    expect(toHex(composite({ ...WHITE, a: 0.5 }, BLACK))).toBe('#808080');
  });

  it('adjusts a color until it passes against every backdrop', () => {
    const yellow = parseHex('#FFCC00');
    expect(contrastRatio(yellow, WHITE)).toBeLessThan(4.5);
    const adjusted = adjustForContrast(yellow, [WHITE, parseHex('#F2F2F7')], 4.5, BLACK);
    expect(contrastRatio(adjusted, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(adjusted, parseHex('#F2F2F7'))).toBeGreaterThanOrEqual(4.5);
  });
});
