import { describe, expect, it } from 'vitest';
import { chunk, inChunks, rowsPerInsert } from './d1';

describe('D1 parameter limits', () => {
  it('splits lists', async () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    const ids = Array.from({ length: 250 }, (_, i) => i);
    const sizes: number[] = [];
    const out = await inChunks(ids, async (slice) => {
      sizes.push(slice.length);
      return slice;
    });
    expect(out).toEqual(ids);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(90);
    expect(rowsPerInsert(7)).toBe(14);
  });
});
