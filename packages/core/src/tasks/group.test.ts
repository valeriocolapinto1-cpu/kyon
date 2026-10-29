import { describe, expect, it } from 'vitest';
import { groupByFile } from './group';

const t = (path: string, id: string) => ({ path, id });

describe('groupByFile', () => {
  it('follows the file order and keeps the task order inside each file', () => {
    const groups = groupByFile(
      [t('b.md', '1'), t('a.md', '2'), t('b.md', '3'), t('a.md', '4')],
      ['a.md', 'b.md'],
    );
    expect(groups.map((g) => [g.path, g.tasks.map((x) => x.id)])).toEqual([
      ['a.md', ['2', '4']],
      ['b.md', ['1', '3']],
    ]);
  });

  it('puts files outside the order last, by path, and handles no tasks', () => {
    expect(
      groupByFile([t('z.md', '1'), t('x.md', '2'), t('a.md', '3')], ['a.md']).map((g) => g.path),
    ).toEqual(['a.md', 'x.md', 'z.md']);
    expect(groupByFile([], ['a.md'])).toEqual([]);
  });
});
