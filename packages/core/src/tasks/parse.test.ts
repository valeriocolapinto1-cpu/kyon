import biohybrid from './fixtures/biohybrid-prossimi-passi.md?raw';
import { describe, expect, it } from 'vitest';
import { classifyPath, globToRegExp } from './glob';
import { isPlanHeading, normalizeTaskText, parseTasks, stripMarks } from './parse';

describe('parseTasks — Biohybrid-like documents', () => {
  const parsed = parseTasks('PROSSIMI-PASSI.md', biohybrid);
  const texts = parsed.tasks.map((t) => t.text);

  it('extracts few tasks: checkboxes anywhere, lists only under plan headings', () => {
    expect(texts).toEqual([
      'Query dei carichi per esercizio',
      'Componente grafico leggero',
      'Asse dei tempi in italiano',
      'Vista "ultimi 3 mesi"',
      'Pagina pubblica del clan',
      'Classifica settimanale',
      'Sfide tra clan',
    ]);
  });

  it('keeps tables as tables and never turns their rows into tasks', () => {
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0]?.markdown.split('\n')).toHaveLength(6);
    expect(parsed.tables[0]?.headingPath).toEqual(['Prossimi passi — Biohybrid', 'Stato generale']);
    expect(texts.some((t) => t.includes('Login'))).toBe(false);
  });

  it('ignores prose, bold-label paragraphs, plain lists outside plan sections and code blocks', () => {
    expect(texts.some((t) => t.includes('Cosa') || t.includes('stampa del browser'))).toBe(false);
    expect(texts.some((t) => t.includes('blocco di codice'))).toBe(false);
    // "Ordine di priorità" is not a plan heading: its numbered list is prose.
    expect(texts).not.toContain('Grafici');
  });

  it('reads done state from checkboxes and from status emoji', () => {
    const done = Object.fromEntries(parsed.tasks.map((t) => [t.text, t.done]));
    expect(done).toMatchObject({
      'Query dei carichi per esercizio': true,
      'Componente grafico leggero': false,
      'Pagina pubblica del clan': true,
      'Classifica settimanale': false,
      'Sfide tra clan': false,
    });
    const clan = parsed.tasks.find((t) => t.text === 'Pagina pubblica del clan');
    expect(clan).toMatchObject({ style: 'emoji', mark: '🟢' });
  });

  it('nests subtasks and notes under their task', () => {
    const parent = parsed.tasks.find((t) => t.text === 'Componente grafico leggero');
    const child = parsed.tasks.find((t) => t.text === 'Asse dei tempi in italiano');
    expect(child?.parentId).toBe(parent?.stableId);
    expect(parent?.notes).toEqual(['nota: niente librerie pesanti']);
    // A bold label inside a plan list is a note of the previous item, not a task.
    const sfide = parsed.tasks.find((t) => t.text === 'Sfide tra clan');
    expect(sfide?.notes).toEqual([]);
  });

  it('records heading paths and exact lines for safe writes', () => {
    const t = parsed.tasks.find((x) => x.text === 'Classifica settimanale');
    expect(t?.headingPath).toEqual([
      'Prossimi passi — Biohybrid',
      '3 · Prossimi passi della community',
    ]);
    expect(biohybrid.split('\n')[t?.line ?? -1]).toBe(t?.raw);
  });
});

describe('parseTasks — edge cases', () => {
  it('supports -, *, + and numbered checkboxes, upper-case X, CRLF and tabs', () => {
    const md = '* [X] uno\r\n+ [ ] due\r\n1. [x] tre\r\n\t- [ ] quattro\r\n';
    const parsed = parseTasks('a.md', md);
    expect(parsed.eol).toBe('\r\n');
    expect(parsed.tasks.map((t) => [t.text, t.done])).toEqual([
      ['uno', true],
      ['due', false],
      ['tre', true],
      ['quattro', false],
    ]);
    expect(parsed.tasks[3]?.parentId).toBe(parsed.tasks[2]?.stableId);
  });

  it('honours kyon: ignore in front matter or a leading comment', () => {
    expect(parseTasks('a.md', '---\ntitle: x\nkyon: ignore\n---\n- [ ] no').tasks).toEqual([]);
    expect(parseTasks('a.md', '<!-- kyon: ignore -->\n- [ ] no').ignored).toBe(true);
    expect(parseTasks('a.md', '---\ntitle: x\n---\n- [ ] sì').tasks).toHaveLength(1);
  });

  it('handles nested fences of different lengths and ~~~', () => {
    const md = '````\n```\n- [ ] no\n```\n````\n~~~\n- [ ] no\n~~~\n- [ ] sì';
    expect(parseTasks('a.md', md).tasks.map((t) => t.text)).toEqual(['sì']);
  });

  it('inherits plan sections into sub-headings and stops at the next sibling heading', () => {
    const md = '## Roadmap\n### Fase 1\n- prima\n## Note\n- non task';
    expect(parseTasks('a.md', md).tasks.map((t) => t.text)).toEqual(['prima']);
  });

  it('applies a level-1 plan title only to the lists right under it', () => {
    const md = '# TODO\n- subito\n## Note varie\n- appunto';
    expect(parseTasks('TODO.md', md).tasks.map((t) => t.text)).toEqual(['subito']);
  });

  it('uses custom plan keywords', () => {
    const md = '## Sprint\n- una cosa';
    expect(parseTasks('a.md', md).tasks).toHaveLength(0);
    expect(parseTasks('a.md', md, { planKeywords: ['sprint'] }).tasks).toHaveLength(1);
  });

  it('gives duplicate tasks distinct, stable ids', () => {
    const md = '- [ ] stessa\n- [ ] stessa';
    const a = parseTasks('a.md', md).tasks;
    const b = parseTasks('a.md', `${md}\n- [ ] altra`).tasks;
    expect(a[0]?.stableId).not.toBe(a[1]?.stableId);
    expect(b.slice(0, 2).map((t) => t.stableId)).toEqual(a.map((t) => t.stableId));
  });

  it('keeps ids stable when the task is ticked or its emphasis changes', () => {
    const before = parseTasks('a.md', '## Piano\n- 🟡 Fare il grafico').tasks[0];
    const after = parseTasks('a.md', '## Piano\n- ✅ **Fare il grafico**').tasks[0];
    expect(after?.stableId).toBe(before?.stableId);
    expect(after?.done).toBe(true);
  });
});

describe('helpers', () => {
  it('recognises plan headings as whole words, accent-insensitive', () => {
    expect(isPlanHeading('3 · Prossimi passi della community')).toBe(true);
    expect(isPlanHeading('Attivita aperte')).toBe(true);
    expect(isPlanHeading('TODO list')).toBe(true);
    expect(isPlanHeading('Taskbar')).toBe(false);
    expect(isPlanHeading('Ordine di priorità')).toBe(false);
  });

  it('strips leading and trailing status marks', () => {
    expect(stripMarks('✅ Fatto')).toEqual({ text: 'Fatto', mark: '✅' });
    expect(stripMarks('**🟢 Bold**')).toEqual({ text: '**Bold**', mark: '🟢' });
    expect(stripMarks('Da fare ⚪')).toEqual({ text: 'Da fare', mark: '⚪' });
    expect(normalizeTaskText('**Fare** il [grafico](x)  ')).toBe('fare il grafico');
  });

  it('matches globs and classifies paths', () => {
    expect(globToRegExp('docs/**').test('docs/a/b.md')).toBe(true);
    expect(globToRegExp('**/archivio/**').test('archivio/x.md')).toBe(true);
    expect(globToRegExp('*.md').test('a/b.md')).toBe(false);
    expect(classifyPath('PROSSIMI-PASSI.md')).toBe('tasks');
    expect(classifyPath('docs/archivio/2025.md')).toBe('archive');
    expect(classifyPath('node_modules/x/README.md')).toBe('ignored');
    expect(classifyPath('src/app.ts')).toBe('ignored');
    expect(classifyPath('vecchio/x.md', ['vecchio/**'])).toBe('ignored');
  });
});
