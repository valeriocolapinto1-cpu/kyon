export type DiffLine = { kind: 'same' | 'add' | 'remove'; text: string };

/** Line diff (LCS) between two prompt versions. Prompts are short: O(n·m) is fine up to ~2k lines. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length * b.length > 4_000_000)
    return [
      ...a.map((text) => ({ kind: 'remove' as const, text })),
      ...b.map((text) => ({ kind: 'add' as const, text })),
    ];
  const width = b.length + 1;
  // lcs[i][j] (length of the longest common subsequence of a[i..] and b[j..]) in one flat array.
  const lcs = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => lcs[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const left = a[i];
    const right = b[j];
    if (left !== undefined && right !== undefined && left === right) {
      out.push({ kind: 'same', text: left });
      i++;
      j++;
    } else if (left !== undefined && (right === undefined || at(i + 1, j) >= at(i, j + 1))) {
      out.push({ kind: 'remove', text: left });
      i++;
    } else if (right !== undefined) {
      out.push({ kind: 'add', text: right });
      j++;
    }
  }
  return out;
}
