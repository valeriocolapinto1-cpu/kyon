import { describe, expect, it } from 'vitest';
import {
  RUN_ID_ALPHABET,
  generateRunId,
  isRunId,
  markerLine,
  parseMarkers,
  suggestedBranch,
} from './marker';

describe('run ids', () => {
  it('are 8 readable characters, uniformly drawn', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generateRunId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(isRunId(id)).toBe(true);
    expect(RUN_ID_ALPHABET).not.toMatch(/[01ilo]/);
    // Bytes ≥ 248 are rejected (no modulo bias).
    let calls = 0;
    const id = generateRunId((n) => {
      calls++;
      return new Uint8Array(n).fill(calls === 1 ? 255 : 0);
    });
    expect(id).toBe('22222222');
  });
});

describe('parseMarkers', () => {
  const id = 'k7f3a9qm';
  it('finds the marker in PR descriptions and commit trailers', () => {
    expect(parseMarkers(`Aggiunge il parser.\n\n${markerLine(id)}\n`)).toEqual([id]);
    expect(parseMarkers(`feat: parser\n\nCo-authored-by: X <x@y>\nKyon-Run: ${id}`)).toEqual([id]);
  });

  it('tolerates case, spaces, list markers, backticks and bold', () => {
    for (const line of [
      `kyon-run: ${id}`,
      `KYON-RUN:${id}`,
      `  Kyon-Run :  ${id}  `,
      `- Kyon-Run: ${id}`,
      `> Kyon-Run: ${id}`,
      `\`Kyon-Run: ${id}\``,
      `Kyon-Run: \`${id}\``,
      `**Kyon-Run: ${id}**`,
      `Kyon-Run: ${id.toUpperCase()}`,
      `Kyon-Run: ${id}\r`,
    ])
      expect(parseMarkers(`Testo\n${line}\naltro`), line).toEqual([id]);
  });

  it('rejects ids inside prose, wrong lengths and foreign characters', () => {
    for (const text of [
      `Vedi Kyon-Run: ${id} per dettagli`,
      `Kyon-Run: ${id}x`,
      `Kyon-Run: k7f3a9q`,
      `Kyon-Run: k7f3a9q0`,
      `KyonRun: ${id}`,
      `Kyon-Run: <id>`,
      '',
    ])
      expect(parseMarkers(text), text).toEqual([]);
    expect(parseMarkers(null)).toEqual([]);
  });

  it('returns distinct ids across multiple commits, in order', () => {
    const log = [`a\n\nKyon-Run: ${id}`, `b\n\nKyon-Run: ${id}`, 'c\n\nKyon-Run: 23456789'].join(
      '\n\n',
    );
    expect(parseMarkers(log)).toEqual([id, '23456789']);
  });
});

describe('suggestedBranch', () => {
  it('slugs the task text', () => {
    expect(suggestedBranch('k7f3a9qm', '**Validare** il modello di crescità (v2)')).toBe(
      'claude/k7f3a9qm-validare-il-modello-di-crescita-v2',
    );
    expect(suggestedBranch('k7f3a9qm', '!!!')).toBe('claude/k7f3a9qm');
    expect(suggestedBranch('k7f3a9qm', 'x'.repeat(80)).length).toBeLessThanOrEqual(52);
  });
});
