import { describe, expect, it } from 'vitest';
import { clockAt, formatClock, handAngles, zoneOffsetMs, zonedClock } from './time';

describe('time', () => {
  it('formats wall-clock time in Europe/Rome, including DST', () => {
    // 26 Oct 2026 is after the switch to CET (UTC+1).
    expect(formatClock(new Date('2026-10-26T10:42:00Z'))).toBe('11:42');
    // July: CEST (UTC+2).
    expect(formatClock(new Date('2026-07-01T22:05:00Z'))).toBe('00:05');
    expect(zonedClock(new Date('2026-10-26T10:42:30Z'))).toEqual({
      hour: 11,
      minute: 42,
      second: 30,
    });
  });

  it('computes hand angles', () => {
    expect(handAngles({ hour: 3, minute: 0, second: 0 })).toEqual({
      hour: 90,
      minute: 0,
      second: 0,
    });
    expect(handAngles({ hour: 12, minute: 30, second: 0 }).hour).toBe(15);
    expect(handAngles({ hour: 0, minute: 0, second: 15 }, 500).second).toBe(93);
  });
});

describe('zone offset and cheap clock', () => {
  it('matches zonedClock in summer, winter and around the DST switch', () => {
    for (const iso of [
      '2026-07-01T10:15:30Z',
      '2026-01-15T23:59:59Z',
      '2026-03-29T00:59:59Z',
      '2026-03-29T01:00:00Z',
      '2026-10-25T00:30:00Z',
      '2026-10-25T01:30:00Z',
    ]) {
      const date = new Date(iso);
      const offset = zoneOffsetMs(date);
      expect(clockAt(date.getTime(), offset)).toEqual(zonedClock(date));
    }
    expect(zoneOffsetMs(new Date('2026-07-01T10:00:00Z'))).toBe(2 * 3600_000);
    expect(zoneOffsetMs(new Date('2026-01-01T10:00:00Z'))).toBe(3600_000);
    expect(zoneOffsetMs(new Date('2026-01-01T10:00:00Z'), 'America/New_York')).toBe(-5 * 3600_000);
  });
});
