import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  isDay,
  monthGrid,
  startOfWeek,
  today,
  weekDays,
  weekday,
} from './calendar';

describe('calendar', () => {
  it('does day arithmetic across months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('starts weeks on Monday', () => {
    expect(weekday('2026-10-26')).toBe(0); // a Monday
    expect(weekday('2026-11-01')).toBe(6);
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26');
    expect(weekDays('2026-10-28')[6]).toBe('2026-11-01');
  });

  it('builds month grids of whole weeks', () => {
    const october = monthGrid('2026-10-15');
    expect(october[0]?.[0]).toBe('2026-09-28');
    expect(october.at(-1)?.[6]).toBe('2026-11-01');
    expect(october.every((w) => w.length === 7)).toBe(true);
    // February 2027 starts on a Monday and has exactly 4 weeks.
    expect(monthGrid('2027-02-10')).toHaveLength(4);
  });

  it('validates days and knows today in a time zone', () => {
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2026-1-01')).toBe(false);
    // 23:30 UTC on Oct 26 is already Oct 27 in Rome (UTC+1 after DST ends).
    expect(today('Europe/Rome', new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-27');
  });
});
