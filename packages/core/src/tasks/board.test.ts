import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, activeFilterCount, matchesFilters, moveId } from './board';

describe('moveId', () => {
  it('moves within a list and inserts from elsewhere, clamping the index', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']);
    expect(moveId(['a', 'b'], 'x', 99)).toEqual(['a', 'b', 'x']);
    expect(moveId([], 'x', -3)).toEqual(['x']);
  });
});

describe('matchesFilters', () => {
  const task = {
    text: '**Validare** il modello di crescita',
    done: false,
    path: 'docs/PIANO.md',
    priority: 'high',
    assignee: { id: 'u1' },
    labels: [{ id: 'l1' }],
    headingPath: ['Prossimi passi', 'Biologia'],
  };

  it('matches with no filters', () => {
    expect(matchesFilters(task, EMPTY_FILTERS)).toBe(true);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('applies each facet', () => {
    expect(matchesFilters(task, { ...EMPTY_FILTERS, state: 'done' })).toBe(false);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, state: 'open' })).toBe(true);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, assignees: ['none'] })).toBe(false);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, assignees: ['u2', 'u1'] })).toBe(true);
    expect(
      matchesFilters({ ...task, assignee: null }, { ...EMPTY_FILTERS, assignees: ['none'] }),
    ).toBe(true);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, labels: ['l2'] })).toBe(false);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, priorities: ['high'] })).toBe(true);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, files: ['TASKS.md'] })).toBe(false);
    expect(activeFilterCount({ ...EMPTY_FILTERS, labels: ['l1'], state: 'open' })).toBe(2);
  });

  it('searches text and section, ignoring accents, case and markup', () => {
    expect(matchesFilters(task, { ...EMPTY_FILTERS, query: 'validare crescita' })).toBe(true);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, query: 'BIOLOGIA' })).toBe(true);
    expect(
      matchesFilters({ ...task, text: 'Perché sì' }, { ...EMPTY_FILTERS, query: 'perche' }),
    ).toBe(true);
    expect(matchesFilters(task, { ...EMPTY_FILTERS, query: 'validare chimica' })).toBe(false);
  });
});
