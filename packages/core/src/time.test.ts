import { describe, expect, it } from 'vitest';
import { formatClock, handAngles, zonedClock } from './time';

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
