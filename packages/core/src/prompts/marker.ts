/**
 * Run ids and the `Kyon-Run: <id>` marker Claude Code writes in the PR description and in
 * commit trailers. Ids are short and readable (no 0/o/1/l/i), 8 characters from a 31-letter
 * alphabet: about 8.5·10¹¹ combinations, not guessable in practice.
 */
export const RUN_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const RUN_ID_LENGTH = 8;
const ID = `[${RUN_ID_ALPHABET}]{${RUN_ID_LENGTH}}`;

export function generateRunId(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  // Rejection sampling: 248 = 8 × 31 keeps the distribution uniform.
  let out = '';
  while (out.length < RUN_ID_LENGTH) {
    for (const byte of random(RUN_ID_LENGTH * 2)) {
      if (byte < 248 && out.length < RUN_ID_LENGTH) out += RUN_ID_ALPHABET[byte % 31];
    }
  }
  return out;
}

export function isRunId(value: string): boolean {
  return new RegExp(`^${ID}$`).test(value);
}

export const markerLine = (id: string) => `Kyon-Run: ${id}`;

/**
 * One marker per line, the whole line: `Kyon-Run: k7f3a9qm`. Tolerated around it: indentation,
 * a list/quote marker, backticks or bold, any case for the key, spaces around the colon.
 * Not accepted: the id inside other text, other lengths, characters outside the alphabet.
 */
const LINE = new RegExp(
  `^[ \\t]*(?:[-*+>][ \\t]+)?(?:\\*\\*|\`)?kyon-run[ \\t]*:[ \\t]*(?:\`)?(${ID})(?:\`)?(?:\\*\\*|\`)?[ \\t]*$`,
  'gim',
);

/** Every distinct run id marked in `text` (PR body or commit messages), in order. */
export function parseMarkers(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.replace(/\r\n?/g, '\n').matchAll(LINE)) {
    const id = match[1]?.toLowerCase();
    if (id && isRunId(id) && !found.includes(id)) found.push(id);
  }
  return found;
}

/** `claude/<id>-<slug-of-the-task>` (ASCII, max ~50 chars). */
export function suggestedBranch(runId: string, taskText: string): string {
  const slug = taskText
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/, '');
  return `claude/${runId}${slug ? `-${slug}` : ''}`;
}
