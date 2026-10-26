import { hash64 } from './hash';

/**
 * Line-based Markdown task parser. It never rewrites the document: it records, for every task,
 * the exact line it came from, so writes can change that single line and nothing else.
 *
 * A task is:
 *  - a GFM checkbox item (`- [ ]`, `* [x]`, `+ [ ]`, `1. [ ]`) anywhere in the file, or
 *  - any list item under a "plan" heading (a heading whose text contains a plan keyword;
 *    sub-headings inherit it, except from a level-1 document title).
 * Not tasks: prose, bold-label paragraphs (`**Cosa.**`), tables, code blocks, front matter.
 */

export const DEFAULT_PLAN_KEYWORDS = [
  'piano',
  'todo',
  'to-do',
  'da fare',
  'fasi',
  'roadmap',
  'prossimi passi',
  'backlog',
  'task',
  'attività',
];

export const DONE_MARKS = ['✅', '🟢', '✔️', '✔', '☑️', '☑'];
export const OPEN_MARKS = ['🟡', '⚪', '⚪️', '🔴', '🟠', '⬜', '⏳', '🔵'];
const ALL_MARKS = [...DONE_MARKS, ...OPEN_MARKS].sort((a, b) => b.length - a.length);

export type StatusStyle = 'checkbox' | 'emoji' | 'plain';

export interface ParsedTask {
  stableId: string;
  /** Repo-relative path of the file. */
  path: string;
  /** Heading texts from the top, e.g. ["1 · Allenamento", "Prossimi passi"]. */
  headingPath: string[];
  /** Task text without list marker, checkbox and status mark (inline Markdown kept). */
  text: string;
  done: boolean;
  style: StatusStyle;
  /** The status emoji used on the line (emoji style only). */
  mark: string | null;
  /** 0-based line index in the file, and the exact original line (for safe writes). */
  line: number;
  raw: string;
  indent: number;
  /** stableId of the parent task for subtasks. */
  parentId: string | null;
  /** Non-task list lines and continuation text nested under the task. */
  notes: string[];
  /** Index among tasks with the same path + headings + text (keeps ids unique). */
  occurrence: number;
}

export interface TableBlock {
  headingPath: string[];
  /** First line index and the raw Markdown of the table. */
  line: number;
  markdown: string;
}

export interface ParsedFile {
  path: string;
  /** `kyon: ignore` in front matter or a leading HTML comment. */
  ignored: boolean;
  tasks: ParsedTask[];
  tables: TableBlock[];
  headings: { level: number; text: string; line: number }[];
  eol: '\n' | '\r\n';
}

export interface ParseOptions {
  planKeywords?: readonly string[];
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;
const CHECKBOX = /^\[([ xX])\](?:[ \t]+|$)(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TABLE_ROW = /^ {0,3}\|/;
const BOLD_LABEL = /^\*\*[^*]{1,60}?[.:]\*\*/;

function indentWidth(spaces: string): number {
  let width = 0;
  for (const ch of spaces) width += ch === '\t' ? 4 - (width % 4) : 1;
  return width;
}

function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Text used for identity: no marks, no emphasis, collapsed spaces, lowercase. */
export function normalizeTaskText(text: string): string {
  return stripMarks(text)
    .text.replace(/[*_`~]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .toLowerCase();
}

/** Removes a leading (or trailing) status emoji, also inside leading bold markers. */
export function stripMarks(text: string): { text: string; mark: string | null } {
  let t = text.trim();
  const lead = /^(\*\*|__)?\s*/.exec(t)?.[0] ?? '';
  const afterLead = t.slice(lead.length);
  for (const mark of ALL_MARKS) {
    if (afterLead.startsWith(mark)) {
      t = (lead + afterLead.slice(mark.length).replace(/^[️\s]+/, '')).trim();
      return { text: t, mark };
    }
  }
  for (const mark of ALL_MARKS) {
    if (t.endsWith(mark))
      return {
        text: t
          .slice(0, -mark.length)
          .replace(/[\s️]+$/, '')
          .trim(),
        mark,
      };
  }
  return { text: t, mark: null };
}

export function isPlanHeading(
  text: string,
  keywords: readonly string[] = DEFAULT_PLAN_KEYWORDS,
): boolean {
  const folded = fold(text);
  return keywords.some((k) => {
    const key = fold(k).trim();
    if (!key) return false;
    // Whole-word match ("task" must not match "taskbar"); keywords may contain spaces.
    return new RegExp(
      `(^|[^\\p{L}\\p{N}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
      'u',
    ).test(folded);
  });
}

function frontMatterIgnore(lines: string[]): { ignored: boolean; skip: number } {
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
    if (end > 0) {
      const ignored = lines.slice(1, end).some((l) => /^\s*kyon\s*:\s*ignore\s*$/i.test(l));
      return { ignored, skip: end + 1 };
    }
  }
  const firstContent = lines.find((l) => l.trim() !== '');
  return {
    ignored: Boolean(firstContent && /<!--\s*kyon\s*:\s*ignore\s*-->/i.test(firstContent)),
    skip: 0,
  };
}

export function parseTasks(path: string, content: string, options: ParseOptions = {}): ParsedFile {
  const keywords = options.planKeywords ?? DEFAULT_PLAN_KEYWORDS;
  const eol: '\n' | '\r\n' = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const { ignored, skip } = frontMatterIgnore(lines);
  const result: ParsedFile = { path, ignored, tasks: [], tables: [], headings: [], eol };
  if (ignored) return result;

  const headingStack: { level: number; text: string; plan: boolean }[] = [];
  /** Open list items: indent and the task they belong to (null for non-task items). */
  let listStack: { indent: number; task: ParsedTask | null }[] = [];
  const occurrences = new Map<string, number>();
  let fence: string | null = null;
  let table: TableBlock | null = null;

  const headingPath = () => headingStack.map((h) => h.text);
  // A plan heading covers its lists and sub-sections. Exception: a level-1 title (often the whole
  // document, e.g. "# Prossimi passi") covers only the lists right under it, not every section.
  const inPlan = () =>
    headingStack.some((h, idx) => h.plan && (h.level > 1 || idx === headingStack.length - 1));
  const nearestTask = () => [...listStack].reverse().find((e) => e.task)?.task ?? null;

  for (let i = skip; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Code fences: everything inside is ignored (checkboxes included).
    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (fenceMatch?.[1] && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length)
        fence = null;
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      continue;
    }

    // Tables are kept as tables (for display) and never become tasks.
    if (TABLE_ROW.test(line)) {
      if (table) table.markdown += `\n${line}`;
      else {
        table = { headingPath: headingPath(), line: i, markdown: line };
        result.tables.push(table);
      }
      listStack = [];
      continue;
    }
    table = null;

    const heading = HEADING.exec(line);
    if (heading?.[1]) {
      const level = heading[1].length;
      const text = (heading[2] ?? '').trim();
      while (headingStack.length && (headingStack[headingStack.length - 1]?.level ?? 0) >= level)
        headingStack.pop();
      headingStack.push({ level, text, plan: isPlanHeading(text, keywords) });
      result.headings.push({ level, text, line: i });
      listStack = [];
      continue;
    }

    if (line.trim() === '') continue;

    const item = LIST_ITEM.exec(line);
    if (!item) {
      // Continuation text of the current item becomes a note; anything else closes the list.
      const indent = indentWidth(/^[ \t]*/.exec(line)?.[0] ?? '');
      const owner = nearestTask();
      if (owner && indent > owner.indent) owner.notes.push(line.trim());
      else listStack = [];
      continue;
    }

    const indent = indentWidth(item[1] ?? '');
    const body = item[4] ?? '';
    while (listStack.length && (listStack[listStack.length - 1]?.indent ?? 0) >= indent)
      listStack.pop();
    const parent = nearestTask();

    const checkbox = CHECKBOX.exec(body);
    const labelOnly = !checkbox && BOLD_LABEL.test(body);
    const isTask = Boolean(checkbox) || (inPlan() && !labelOnly);

    if (!isTask) {
      if (parent) parent.notes.push(stripListMarker(line));
      listStack.push({ indent, task: null });
      continue;
    }

    const afterBox = checkbox ? (checkbox[2] ?? '') : body;
    const { text, mark } = stripMarks(afterBox);
    const style: StatusStyle = checkbox ? 'checkbox' : mark ? 'emoji' : 'plain';
    const done = checkbox
      ? checkbox[1]?.toLowerCase() === 'x'
      : mark
        ? DONE_MARKS.includes(mark)
        : false;
    const hp = headingPath();
    const normalized = normalizeTaskText(text);
    const key = `${path}\n${hp.join('\u001f')}\n${normalized}`;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);

    const task: ParsedTask = {
      stableId: hash64(`${key}\n${occurrence}`),
      path,
      headingPath: hp,
      text,
      done,
      style,
      mark: checkbox ? null : mark,
      line: i,
      raw: line,
      indent,
      parentId: parent?.stableId ?? null,
      notes: [],
      occurrence,
    };
    result.tasks.push(task);
    listStack.push({ indent, task });
  }
  return result;
}

function stripListMarker(line: string): string {
  return line.replace(/^[ \t]*([-*+]|\d{1,9}[.)])[ \t]+/, '').trim();
}
