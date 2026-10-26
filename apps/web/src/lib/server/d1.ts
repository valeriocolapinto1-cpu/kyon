/**
 * D1 binds at most 100 parameters per statement ("too many SQL variables" beyond that).
 * Long IN lists and multi-row inserts must be split.
 */
export const D1_MAX_PARAMS = 100;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `query` on slices of `ids` small enough for D1 (leaving room for other parameters). */
export async function inChunks<T, R>(
  ids: readonly T[],
  query: (slice: T[]) => Promise<R[]>,
  reserved = 10,
): Promise<R[]> {
  const results: R[] = [];
  for (const slice of chunk(ids, D1_MAX_PARAMS - reserved)) results.push(...(await query(slice)));
  return results;
}

/** Rows per multi-row INSERT for a table with `columns` bound values per row. */
export const rowsPerInsert = (columns: number) => Math.max(1, Math.floor(D1_MAX_PARAMS / columns));
