import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '../limits';
import { checkAttachment, sanitizeFileName } from './files';
import { parsePreviewTarget, previewTargets } from './links';
import { filterMentionable, findMentions, mentionQuery } from './mentions';

const people = [
  { id: 'v', name: 'Valerio' },
  { id: 'vr', name: 'Valerio Rossi' },
  { id: 'c', name: 'Christian' },
  { id: 'n', name: 'Niccolò' },
];

describe('mentions', () => {
  it('finds members, longest name first, accent-insensitive', () => {
    expect(findMentions('Ciao @Christian e @valerio rossi!', people)).toEqual(['c', 'vr']);
    expect(findMentions('@Valerio, guarda', people)).toEqual(['v']);
    expect(findMentions('per @niccolo', people)).toEqual(['n']);
  });

  it('ignores emails, longer words and code', () => {
    expect(findMentions('scrivi a christian@kyon.it', people)).toEqual([]);
    expect(findMentions('@Christiano no', people)).toEqual([]);
    expect(findMentions('`@Christian` e ```\n@Valerio\n```', people)).toEqual([]);
  });

  it('autocompletes at the caret', () => {
    expect(mentionQuery('ciao @Chr', 9)).toEqual({ start: 5, query: 'Chr' });
    expect(mentionQuery('mail a@b', 8)).toBeNull();
    expect(mentionQuery('nessuna', 7)).toBeNull();
    expect(filterMentionable(people, 'ro').map((p) => p.id)).toEqual(['vr']);
    expect(filterMentionable(people, '').length).toBe(4);
  });
});

describe('link previews', () => {
  it('recognizes GitHub PRs, issues, commits and Kyon pages only', () => {
    expect(parsePreviewTarget('https://github.com/cerbero/biohybrid/pull/12', null)).toMatchObject({
      kind: 'github_pull',
      number: 12,
    });
    expect(
      parsePreviewTarget('https://github.com/cerbero/biohybrid/issues/3).', null),
    ).toMatchObject({ kind: 'github_issue', number: 3 });
    expect(parsePreviewTarget('https://github.com/a/b/commit/ABCDEF1', null)).toMatchObject({
      kind: 'github_commit',
      sha: 'abcdef1',
    });
    expect(
      parsePreviewTarget(
        'https://kyon.example.dev/progetti?id=p1&task=t1',
        'https://kyon.example.dev',
      ),
    ).toMatchObject({ kind: 'kyon_project', projectId: 'p1', taskId: 't1' });
    for (const bad of [
      'https://evil.com/cerbero/x/pull/1',
      'http://github.com/a/b/pull/1',
      'https://github.com/a/b/pull/1/files',
      'https://github.com.evil.com/a/b/pull/1',
      'https://kyon.example.dev/admin',
      'javascript:alert(1)',
      'http://127.0.0.1/progetti?id=x',
    ])
      expect(parsePreviewTarget(bad, 'https://kyon.example.dev'), bad).toBeNull();
  });

  it('takes at most 3 distinct links, not inside code', () => {
    const text =
      'vedi https://github.com/a/b/pull/1 e `https://github.com/a/b/pull/2` poi https://github.com/a/b/pull/1';
    expect(previewTargets(text, null).map((t) => t.url)).toEqual(['https://github.com/a/b/pull/1']);
  });
});

describe('attachments', () => {
  it('sanitizes names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\foto bella.jpg')).toBe('foto bella.jpg');
    expect(sanitizeFileName('a<b>|c?.png')).toBe('a_b_c_.png');
    expect(sanitizeFileName('...')).toBe('file');
    expect(sanitizeFileName(`${'x'.repeat(200)}.pdf`).length).toBeLessThanOrEqual(120);
  });

  it('allows images, documents, code and zip up to 10 MB; serves code as text', () => {
    expect(checkAttachment('foto.jpg', 'image/jpeg', 1000)).toMatchObject({
      ok: true,
      image: true,
    });
    expect(checkAttachment('doc.pdf', 'application/pdf', 1000)).toMatchObject({ ok: true });
    expect(checkAttachment('main.ts', 'video/mp2t', 1000)).toMatchObject({
      ok: true,
      mime: 'text/plain',
    });
    expect(checkAttachment('x.zip', 'application/zip', MAX_ATTACHMENT_BYTES)).toMatchObject({
      ok: true,
    });
    expect(checkAttachment('x.zip', 'application/zip', MAX_ATTACHMENT_BYTES + 1)).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(checkAttachment('pagina.html', 'text/html', 10)).toEqual({
      ok: true,
      mime: 'text/plain',
      name: 'pagina.html',
      image: false,
    });
    expect(checkAttachment('img.svg', 'image/svg+xml', 10)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(checkAttachment('virus.exe', 'application/octet-stream', 10)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(checkAttachment('finto.jpg', 'application/pdf', 10)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(checkAttachment('vuoto.txt', 'text/plain', 0)).toEqual({ ok: false, reason: 'empty' });
  });
});

import { isEmoji } from './emoji';

describe('isEmoji', () => {
  it('accepts emoji and sequences, refuses text', () => {
    for (const e of ['👍', '❤️', '👍🏽', '👩‍💻', '🇮🇹', '1️⃣', '🎉']) expect(isEmoji(e), e).toBe(true);
    for (const t of ['', 'ok', '1', '#', '<b>', '👍 ok', '👍'.repeat(10)])
      expect(isEmoji(t), t).toBe(false);
  });
});
