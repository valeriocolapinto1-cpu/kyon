import { normalizeTaskText, type ParsedTask } from './parse';

/** Two texts this similar (0..1, bigram Dice) in the same file+section are the same task, edited. */
export const SIMILARITY_THRESHOLD = 0.75;

function bigrams(text: string): Map<string, number> {
  const s = ` ${text} `;
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

interface Profile {
  text: string;
  grams: Map<string, number>;
  size: number;
}

function profile(raw: string): Profile {
  const text = normalizeTaskText(raw);
  const grams = bigrams(text);
  let size = 0;
  for (const n of grams.values()) size += n;
  return { text, grams, size };
}

function compare(a: Profile, b: Profile): number {
  if (a.text === b.text) return 1;
  if (!a.text || !b.text) return 0;
  // Dice can't reach the threshold when sizes are too different: skip the work.
  if ((2 * Math.min(a.size, b.size)) / (a.size + b.size) < SIMILARITY_THRESHOLD) return 0;
  let overlap = 0;
  const [small, large] = a.grams.size <= b.grams.size ? [a.grams, b.grams] : [b.grams, a.grams];
  for (const [g, n] of small) overlap += Math.min(n, large.get(g) ?? 0);
  return (2 * overlap) / (a.size + b.size);
}

export function similarity(a: string, b: string): number {
  const x = normalizeTaskText(a);
  const y = normalizeTaskText(b);
  if (x === y) return 1;
  if (!x || !y) return 0;
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of bx) {
    overlap += Math.min(n, by.get(g) ?? 0);
    total += n;
  }
  for (const n of by.values()) total += n;
  return (2 * overlap) / total;
}

export interface KnownTask {
  /** Metadata row id. */
  id: string;
  stableId: string;
  path: string;
  headingPath: string[];
  text: string;
}

export interface Reconciliation {
  /** Existing metadata rows matched to parsed tasks (stableId may have changed). */
  matched: { id: string; task: ParsedTask; by: 'exact' | 'similar' }[];
  /** Parsed tasks with no metadata yet. */
  created: ParsedTask[];
  /** Metadata rows whose task disappeared. */
  orphaned: string[];
}

/**
 * Matches the previous metadata to a fresh parse: exact stable id first, then same file and
 * section with similar text (greedy, best first), else new / orphaned.
 */
export function reconcile(known: KnownTask[], parsed: ParsedTask[]): Reconciliation {
  const byStable = new Map(parsed.map((t) => [t.stableId, t]));
  const used = new Set<string>();
  const matched: Reconciliation['matched'] = [];
  const pending: KnownTask[] = [];

  for (const k of known) {
    const exact = byStable.get(k.stableId);
    if (exact && !used.has(exact.stableId)) {
      used.add(exact.stableId);
      matched.push({ id: k.id, task: exact, by: 'exact' });
    } else {
      pending.push(k);
    }
  }

  // Profiles computed once per text (not per pair), and only within the same file + section.
  const sectionKey = (path: string, headings: string[]) => `${path}\n${headings.join('\u001f')}`;
  const free = new Map<string, { t: ParsedTask; p: Profile }[]>();
  for (const t of parsed) {
    if (used.has(t.stableId)) continue;
    const key = sectionKey(t.path, t.headingPath);
    const pool = free.get(key) ?? [];
    pool.push({ t, p: profile(t.text) });
    free.set(key, pool);
  }
  const candidates: { k: KnownTask; t: ParsedTask; score: number }[] = [];
  for (const k of pending) {
    const pool = free.get(sectionKey(k.path, k.headingPath));
    if (!pool) continue;
    const pk = profile(k.text);
    for (const { t, p } of pool) {
      const score = compare(pk, p);
      if (score >= SIMILARITY_THRESHOLD) candidates.push({ k, t, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const matchedKnown = new Set<string>();
  for (const c of candidates) {
    if (matchedKnown.has(c.k.id) || used.has(c.t.stableId)) continue;
    matchedKnown.add(c.k.id);
    used.add(c.t.stableId);
    matched.push({ id: c.k.id, task: c.t, by: 'similar' });
  }

  return {
    matched,
    created: parsed.filter((t) => !used.has(t.stableId)),
    orphaned: pending.filter((k) => !matchedKnown.has(k.id)).map((k) => k.id),
  };
}

/** Finds a task again in a fresh parse (after a write conflict): by id, else by similar text. */
export function relocate(
  task: Pick<ParsedTask, 'stableId' | 'path' | 'headingPath' | 'text'>,
  parsed: ParsedTask[],
): ParsedTask | null {
  const exact = parsed.find((t) => t.stableId === task.stableId);
  if (exact) return exact;
  const { matched } = reconcile([{ id: 'x', ...task }], parsed);
  return matched[0]?.task ?? null;
}
