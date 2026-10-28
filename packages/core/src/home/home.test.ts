import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  likeContains,
  moveHomeBlock,
  normalizeHomeLayout,
  safeResumePath,
  HOME_BLOCKS,
} from './index';

describe('ics', () => {
  it('escapes text values', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = `SUMMARY:${'è'.repeat(60)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n ');
    expect(parts.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    expect(enc.encode(parts[0]).length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(enc.encode(p).length).toBeLessThanOrEqual(74);
    expect(parts.join('')).toBe(line);
    expect(foldIcsLine('SHORT:1')).toBe('SHORT:1');
  });

  it('builds all-day events ending the next day, with CRLF', () => {
    const ics = buildIcs(
      'Kyon, scadenze',
      [
        { uid: 't1@kyon', day: '2026-12-31', summary: 'Biohybrid: Parser', url: 'https://k/x' },
        { uid: 't2@kyon', day: '2026-02-28', summary: 'Altro', description: 'Riga 1\nRiga 2' },
      ],
      new Date('2026-10-26T10:00:00Z'),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Kyon\\, scadenze');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101');
    expect(ics).toContain('DTEND;VALUE=DATE:20260301');
    expect(ics).toContain('DTSTAMP:20261026T100000Z');
    expect(ics).toContain('DESCRIPTION:Riga 1\\nRiga 2');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('BEGIN:VEVENT')).toHaveLength(3);
  });
});

describe('home layout', () => {
  it('fills in defaults and drops junk', () => {
    expect(normalizeHomeLayout(null).map((b) => b.id)).toEqual([...HOME_BLOCKS]);
    const layout = normalizeHomeLayout([
      { id: 'online', hidden: true },
      { id: 'nope' },
      { id: 'online' },
      'x',
      null,
      { id: 'contributions', hidden: 'yes' },
    ]);
    expect(layout[0]).toEqual({ id: 'online', hidden: true });
    expect(layout[1]).toEqual({ id: 'contributions', hidden: false });
    expect(layout).toHaveLength(HOME_BLOCKS.length);
  });

  it('moves blocks within range', () => {
    const layout = normalizeHomeLayout(null);
    expect(moveHomeBlock(layout, 'myTasks', -1)[0]?.id).toBe('myTasks');
    expect(moveHomeBlock(layout, 'contributions', -1)).toBe(layout);
    expect(moveHomeBlock(layout, 'online', 1)).toBe(layout);
  });
});

describe('resume path and search', () => {
  it('accepts only in-app pages', () => {
    expect(safeResumePath('/progetti?id=1&tab=prompt')).toBe('/progetti?id=1&tab=prompt');
    for (const bad of [
      '//evil.com',
      'https://x',
      '/api/me',
      '/login',
      '/\\evil',
      3,
      '/join?code=1',
    ])
      expect(safeResumePath(bad)).toBeNull();
  });

  it('escapes LIKE wildcards', () => {
    expect(likeContains('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });
});
