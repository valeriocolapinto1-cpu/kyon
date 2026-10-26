import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative';

describe('relativeTime', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  it('speaks Italian', () => {
    expect(relativeTime(new Date('2026-10-26T11:59:50Z'), now)).toBe('adesso');
    expect(relativeTime(new Date('2026-10-26T11:58:00Z'), now)).toBe('2 minuti fa');
    expect(relativeTime(new Date('2026-10-25T12:00:00Z'), now)).toBe('ieri');
    expect(relativeTime(new Date('2026-10-29T12:00:00Z'), now)).toBe('tra 3 giorni');
  });
});
