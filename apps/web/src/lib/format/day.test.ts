import { describe, expect, it } from 'vitest';
import { formatDayLong, formatDayShort, formatMonth } from './day';

describe('day formatting', () => {
  it('formats days in Italian without time zone shifts', () => {
    expect(formatDayShort('2026-11-03')).toBe('3 nov');
    expect(formatDayLong('2026-11-03')).toBe('martedì 3 novembre 2026');
    expect(formatMonth('2026-01-31')).toBe('gennaio 2026');
  });
});
