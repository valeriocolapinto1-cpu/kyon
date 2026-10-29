import { stripMarks } from './parse';

/** Longest title shown for a task in lists and menus. */
export const SUMMARY_MAX = 60;
/** A cut that would leave less than this is not worth it: the whole text is kept. */
const MIN_HEAD = 12;

function plain(text: string): string {
  return stripMarks(text)
    .text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drops "(…)" asides, unless nothing meaningful would be left. */
function withoutAsides(text: string): string {
  const stripped = text
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length >= MIN_HEAD ? stripped : text;
}

/** First clause: up to a sentence end (". " before a capital), " — ", ": " or "; ". */
function firstClause(text: string): string {
  const cut = /\.\s+(?=\p{Lu})|\s[—–]\s|:\s|;\s/u.exec(text);
  const head = cut ? text.slice(0, cut.index) : text;
  return head.length >= MIN_HEAD ? head : text;
}

/**
 * Short title for a task: Markdown and status marks removed, asides dropped, cut at the first
 * clause and, if still long, at a word boundary with "…". Deterministic (no model call): the
 * full text stays in the task detail.
 */
export function summarizeTask(text: string, max = SUMMARY_MAX): string {
  const clause = firstClause(withoutAsides(plain(text))).replace(/[\s.:;,]+$/, '');
  if (clause.length <= max) return clause;
  const room = clause.slice(0, max - 1);
  const space = room.lastIndexOf(' ');
  const cut = space >= max / 2 ? room.slice(0, space) : room;
  return `${cut.replace(/[\s.:;,]+$/, '')}…`;
}
