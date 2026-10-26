/** @mentions in chat messages. Names can contain spaces ("@Valerio Rossi"): longest match wins. */

export interface Mentionable {
  id: string;
  name: string;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Ids of the people mentioned in `text`, among `people` (the room's members). A mention is
 * `@` + a member's name, not followed by a letter or digit; inside code it doesn't count.
 */
export function findMentions(text: string, people: Mentionable[]): string[] {
  const plain = fold(text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' '));
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  const found: string[] = [];
  let index = plain.indexOf('@');
  while (index !== -1) {
    const before = index === 0 ? ' ' : (plain[index - 1] ?? ' ');
    if (!/[\p{L}\p{N}_.]/u.test(before)) {
      const rest = plain.slice(index + 1);
      for (const person of sorted) {
        const name = fold(person.name);
        if (!name || !rest.startsWith(name)) continue;
        const next = rest[name.length];
        if (next !== undefined && /[\p{L}\p{N}_]/u.test(next)) continue;
        if (!found.includes(person.id)) found.push(person.id);
        break;
      }
    }
    index = plain.indexOf('@', index + 1);
  }
  return found;
}

/** The `@partial` being typed at the caret, for autocomplete: null when not in a mention. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const head = text.slice(0, caret);
  const at = head.lastIndexOf('@');
  if (at === -1) return null;
  const before = at === 0 ? ' ' : (head[at - 1] ?? ' ');
  if (/[\p{L}\p{N}_.]/u.test(before)) return null;
  const query = head.slice(at + 1);
  if (query.length > 30 || /\n/.test(query) || /\s{2}/.test(query)) return null;
  return { start: at, query };
}

export function filterMentionable(people: Mentionable[], query: string): Mentionable[] {
  const q = fold(query.trim());
  return people
    .filter(
      (p) =>
        fold(p.name)
          .split(/\s+/)
          .some((part) => part.startsWith(q)) || fold(p.name).startsWith(q),
    )
    .slice(0, 6);
}
