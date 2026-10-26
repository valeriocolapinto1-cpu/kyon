import biohybrid from './fixtures/biohybrid-prossimi-passi.md?raw';
import { describe, expect, it } from 'vitest';
import { TaskMovedError, addTask, renameTask, setTaskDone, tasksTemplate } from './edit';
import { parseTasks } from './parse';
import { reconcile, relocate, similarity } from './reconcile';

/** Test helper: fails loudly instead of using non-null assertions. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('missing test value');
  return value;
}

const find = (content: string, text: string) =>
  parseTasks('f.md', content).tasks.find((t) => t.text === text);

/** Asserts that `after` differs from `before` in exactly one line (or one inserted line). */
function diffLines(before: string, after: string) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  return b.filter((line, i) => a[i] !== line || a.length !== b.length).length;
}

describe('setTaskDone', () => {
  it('toggles a checkbox and changes only that line', () => {
    const task = find(biohybrid, 'Componente grafico leggero');
    const after = setTaskDone(biohybrid, must(task), true);
    expect(find(after, 'Componente grafico leggero')?.done).toBe(true);
    expect(after.split('\n').filter((l, i) => l !== biohybrid.split('\n')[i])).toEqual([
      '- [x] Componente grafico leggero',
    ]);
    expect(setTaskDone(after, must(find(after, 'Componente grafico leggero')), false)).toBe(
      biohybrid,
    );
  });

  it('writes the same kind of mark for emoji tasks', () => {
    const after = setTaskDone(biohybrid, must(find(biohybrid, 'Classifica settimanale')), true);
    expect(after).toContain('2. ✅ Classifica settimanale');
    expect(diffLines(biohybrid, after)).toBe(1);
    const reopened = setTaskDone(after, must(find(after, 'Classifica settimanale')), false);
    expect(reopened).toContain('2. ⚪ Classifica settimanale');
  });

  it('converts a plain plan item into a ticked checkbox', () => {
    const md = '## Piano\n\n1. Scrivere i test\n- Altro';
    const after = setTaskDone(md, must(find(md, 'Scrivere i test')), true);
    expect(after).toBe('## Piano\n\n1. [x] Scrivere i test\n- Altro');
    expect(find(after, 'Scrivere i test')?.done).toBe(true);
  });

  it('keeps CRLF line endings', () => {
    const md = '- [ ] a\r\n- [ ] b\r\n';
    const after = setTaskDone(md, must(parseTasks('f.md', md).tasks[1]), true);
    expect(after).toBe('- [ ] a\r\n- [x] b\r\n');
  });

  it('refuses to edit a line that changed meanwhile', () => {
    const task = must(find(biohybrid, 'Vista "ultimi 3 mesi"'));
    const changed = biohybrid.replace('Vista "ultimi 3 mesi"', 'Vista "ultimi 6 mesi"');
    expect(() => setTaskDone(changed, task, true)).toThrow(TaskMovedError);
  });
});

describe('renameTask', () => {
  it('keeps marker, checkbox, indentation and mark', () => {
    let md = biohybrid;
    md = renameTask(md, must(find(md, 'Asse dei tempi in italiano')), 'Asse dei tempi localizzato');
    expect(md).toContain('  - [ ] Asse dei tempi localizzato');
    md = renameTask(md, must(find(md, 'Sfide tra clan')), 'Sfide tra due clan');
    expect(md).toContain('3. ⚪ Sfide tra due clan');
    expect(diffLines(biohybrid, md)).toBe(2);
  });

  it('flattens newlines in the new text', () => {
    const md = '- [ ] a';
    expect(renameTask(md, must(parseTasks('f.md', md).tasks[0]), 'riga\nnuova')).toBe(
      '- [ ] riga nuova',
    );
  });
});

describe('addTask', () => {
  it('appends to the list of the chosen section', () => {
    const { content, line } = addTask(
      biohybrid,
      ['Prossimi passi — Biohybrid', '1 · Grafici dei progressi'],
      'Legenda dei colori',
    );
    const lines = content.split('\n');
    expect(lines[line]).toBe('- [ ] Legenda dei colori');
    expect(lines[line - 1]).toBe('- [ ] Vista "ultimi 3 mesi"');
    expect(find(content, 'Legenda dei colori')?.headingPath[1]).toBe('1 · Grafici dei progressi');
  });

  it('adds under a heading without a list, and at the end of the file otherwise', () => {
    const md = '# T\n\n## Da fare\n\n## Fatto\n';
    const a = addTask(md, ['T', 'Da fare'], 'prima');
    expect(find(a.content, 'prima')?.headingPath).toEqual(['T', 'Da fare']);
    const b = addTask('Testo\n', null, 'in fondo');
    expect(b.content).toBe('Testo\n\n- [ ] in fondo\n');
  });

  it('starts from a template that parses into one task', () => {
    const md = tasksTemplate('Biohybrid');
    expect(parseTasks('TASKS.md', md).tasks.map((t) => t.text)).toEqual([
      'Scrivi qui la prima task',
    ]);
  });
});

describe('reconcile', () => {
  const base = parseTasks(
    'f.md',
    '## Piano\n- [ ] Grafico dei carichi\n- [ ] Export PDF\n- [ ] Notifiche',
  ).tasks;
  const known = base.map((t, i) => ({
    id: `m${i}`,
    stableId: t.stableId,
    path: t.path,
    headingPath: t.headingPath,
    text: t.text,
  }));

  it('matches exact ids, similar edits, new and removed tasks', () => {
    const next = parseTasks(
      'f.md',
      '## Piano\n- [x] Grafico dei carichi\n- [ ] Export in PDF\n- [ ] Classifica',
    ).tasks;
    const r = reconcile(known, next);
    expect(r.matched.map((m) => [m.id, m.task.text, m.by])).toEqual([
      ['m0', 'Grafico dei carichi', 'exact'],
      ['m1', 'Export in PDF', 'similar'],
    ]);
    expect(r.created.map((t) => t.text)).toEqual(['Classifica']);
    expect(r.orphaned).toEqual(['m2']);
  });

  it('does not match across sections', () => {
    const moved = parseTasks('f.md', '## Backlog\n- [ ] Grafico dei carichi').tasks;
    expect(reconcile(known.slice(0, 1), moved).orphaned).toEqual(['m0']);
  });

  it('relocates a task after concurrent edits', () => {
    const fresh = parseTasks(
      'f.md',
      '## Piano\n- [ ] Nuova in cima\n- [ ] Grafico dei carichi!',
    ).tasks;
    expect(relocate(must(base[0]), fresh)?.text).toBe('Grafico dei carichi!');
    expect(similarity('Export PDF', 'Notifiche push')).toBeLessThan(0.5);
  });
});
