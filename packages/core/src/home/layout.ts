/** The Home blocks a person can reorder and hide (the order here is the default). */
export const HOME_BLOCKS = [
  'clock',
  'contributions',
  'myTasks',
  'runs',
  'comments',
  'online',
] as const;

export type HomeBlockId = (typeof HOME_BLOCKS)[number];

export interface HomeBlockSetting {
  id: HomeBlockId;
  hidden: boolean;
}

const isBlock = (id: unknown): id is HomeBlockId =>
  typeof id === 'string' && (HOME_BLOCKS as readonly string[]).includes(id);

/**
 * Whatever is saved (old versions, other devices, hand edits) becomes a full valid layout:
 * unknown and repeated blocks dropped, new blocks appended visible.
 */
export function normalizeHomeLayout(raw: unknown): HomeBlockSetting[] {
  const result: HomeBlockSetting[] = [];
  if (Array.isArray(raw))
    for (const item of raw) {
      const id = (item as { id?: unknown } | null)?.id;
      if (!isBlock(id) || result.some((r) => r.id === id)) continue;
      result.push({ id, hidden: (item as { hidden?: unknown }).hidden === true });
    }
  for (const id of HOME_BLOCKS)
    if (!result.some((r) => r.id === id)) result.push({ id, hidden: false });
  return result;
}

/** Moves a block one step up (-1) or down (+1); out of range is a no-op. */
export function moveHomeBlock(
  layout: HomeBlockSetting[],
  id: HomeBlockId,
  step: -1 | 1,
): HomeBlockSetting[] {
  const from = layout.findIndex((b) => b.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
}

/** A saved "where you left off": only in-app paths, never another origin. */
export function safeResumePath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 500) return null;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if (/^\/(api|login|join|reset|ws|_next)(\/|\?|$)/.test(path)) return null;
  return path;
}

/** Escapes a user query for `LIKE ? ESCAPE '\'` (contains). */
export function likeContains(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
