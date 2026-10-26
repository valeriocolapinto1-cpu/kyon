import { normalizeTaskText } from './parse';

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const MAX_COLUMNS = 8;
export const MAX_LABELS = 30;
/** Moves into or out of the done column wait this long before writing to the repo. */
export const DONE_MOVE_DEBOUNCE_MS = 2_500;

/** `ids` with `id` moved to `index` (clamped). Works whether or not `id` was already in the list. */
export function moveId(ids: readonly string[], id: string, index: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

export interface FilterableTask {
  text: string;
  done: boolean;
  path: string;
  priority: string;
  assignee: { id: string } | null;
  labels: { id: string }[];
  headingPath: string[];
}

export interface TaskFilters {
  /** User ids; 'none' = unassigned. */
  assignees: string[];
  labels: string[];
  priorities: string[];
  state: 'all' | 'open' | 'done';
  files: string[];
  query: string;
}

export const EMPTY_FILTERS: TaskFilters = {
  assignees: [],
  labels: [],
  priorities: [],
  state: 'all',
  files: [],
  query: '',
};

export function activeFilterCount(f: TaskFilters): number {
  return (
    (f.assignees.length ? 1 : 0) +
    (f.labels.length ? 1 : 0) +
    (f.priorities.length ? 1 : 0) +
    (f.state !== 'all' ? 1 : 0) +
    (f.files.length ? 1 : 0)
  );
}

/** Every chosen facet must match (OR inside a facet); the query matches text or section, accent-insensitive. */
export function matchesFilters(task: FilterableTask, f: TaskFilters): boolean {
  if (f.state === 'open' && task.done) return false;
  if (f.state === 'done' && !task.done) return false;
  if (f.files.length && !f.files.includes(task.path)) return false;
  if (f.priorities.length && !f.priorities.includes(task.priority)) return false;
  if (f.assignees.length && !f.assignees.includes(task.assignee?.id ?? 'none')) return false;
  if (f.labels.length && !task.labels.some((l) => f.labels.includes(l.id))) return false;
  const query = fold(f.query);
  if (query) {
    const haystack = fold(`${normalizeTaskText(task.text)} ${task.headingPath.join(' ')}`);
    if (!query.split(' ').every((word) => haystack.includes(word))) return false;
  }
  return true;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
