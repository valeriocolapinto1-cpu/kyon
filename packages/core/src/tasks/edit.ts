import { DONE_MARKS, parseTasks, type ParsedTask } from './parse';

/**
 * Minimal edits: each function changes (or inserts) exactly one line and keeps line endings,
 * indentation, list markers and everything else in the file byte-for-byte.
 */

export class TaskMovedError extends Error {
  constructor() {
    super('The task line changed since it was read');
  }
}

const PREFIX = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)/;

function splitKeep(content: string) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  return { lines: content.split(/\r?\n/), eol };
}

function checkLine(lines: string[], task: Pick<ParsedTask, 'line' | 'raw'>) {
  if (lines[task.line] !== task.raw) throw new TaskMovedError();
}

/** Sets the done state. Checkbox → `[x]`/`[ ]`; emoji → ✅/⚪; plain → converted to `[x]`. */
export function setTaskDone(content: string, task: ParsedTask, done: boolean): string {
  const { lines, eol } = splitKeep(content);
  checkLine(lines, task);
  const line = task.raw;
  let next = line;
  if (task.style === 'checkbox') {
    next = line.replace(/^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[[ xX]\]/, `$1[${done ? 'x' : ' '}]`);
  } else if (task.style === 'emoji' && task.mark) {
    const already = DONE_MARKS.includes(task.mark);
    if (done !== already) next = line.replace(task.mark, done ? '✅' : '⚪');
  } else if (task.style === 'plain' && done) {
    next = line.replace(PREFIX, '$1[x] ');
  }
  lines[task.line] = next;
  return lines.join(eol);
}

function sanitizeText(text: string): string {
  // A task is one line: no newlines, no leading list syntax that would change its meaning.
  return text.replace(/[\r\n]+/g, ' ').trim();
}

/** Replaces the text, keeping marker, checkbox and status mark. */
export function renameTask(content: string, task: ParsedTask, newText: string): string {
  const { lines, eol } = splitKeep(content);
  checkLine(lines, task);
  const prefix = PREFIX.exec(task.raw)?.[1] ?? '- ';
  const text = sanitizeText(newText);
  let next: string;
  if (task.style === 'checkbox') {
    next = `${prefix}[${task.done ? 'x' : ' '}] ${text}`;
  } else if (task.style === 'emoji' && task.mark) {
    const body = task.raw.slice(prefix.length).replace(/^(\*\*|__)/, '');
    next = body.startsWith(task.mark)
      ? `${prefix}${task.mark} ${text}`
      : `${prefix}${text} ${task.mark}`;
  } else {
    next = `${prefix}${text}`;
  }
  lines[task.line] = next;
  return lines.join(eol);
}

/**
 * Adds `- [ ] text` at the end of the list in the section identified by `headingPath`
 * (or at the end of the file). Returns the new content and the inserted line index.
 */
export function addTask(
  content: string,
  headingPath: string[] | null,
  text: string,
): { content: string; line: number } {
  const { lines, eol } = splitKeep(content);
  const parsed = parseTasks('', content);
  const clean = sanitizeText(text);
  let insertAt = lines.length;
  let marker = '-';

  if (headingPath && headingPath.length) {
    const target = parsed.headings.find((h, idx) => {
      if (h.text !== headingPath[headingPath.length - 1]) return false;
      // Match the full path: walk back through enclosing headings.
      const enclosing: string[] = [];
      let level = h.level;
      for (let j = idx - 1; j >= 0; j--) {
        const prev = parsed.headings[j];
        if (prev && prev.level < level) {
          enclosing.unshift(prev.text);
          level = prev.level;
        }
      }
      return enclosing.join('\u001f') === headingPath.slice(0, -1).join('\u001f');
    });
    if (target) {
      const next = parsed.headings.find((h) => h.line > target.line && h.level <= target.level);
      const end = next ? next.line : lines.length;
      // After the last list line of the section (nested lines included), else right after the heading.
      let last = -1;
      for (let j = target.line + 1; j < end; j++) {
        const l = lines[j] ?? '';
        const item = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+/.exec(l);
        if (item) {
          last = j;
          if (!item[1]) marker = /\d/.test(item[2] ?? '') ? '-' : (item[2] ?? '-');
        } else if (last >= 0 && /^[ \t]+\S/.test(l)) {
          last = j;
        }
      }
      if (last >= 0) {
        insertAt = last + 1;
      } else {
        insertAt = target.line + 1;
        lines.splice(insertAt, 0, '');
        insertAt += 1;
      }
    }
  }

  if (insertAt === lines.length) {
    // End of file: keep a single trailing newline after the new item.
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lines.length && !/^[ \t]*([-*+]|\d{1,9}[.)])[ \t]+/.test(lines[lines.length - 1] ?? ''))
      lines.push('');
    lines.push(`${marker} [ ] ${clean}`, '');
    return { content: lines.join(eol), line: lines.length - 2 };
  }
  lines.splice(insertAt, 0, `${marker} [ ] ${clean}`);
  return { content: lines.join(eol), line: insertAt };
}

/** Starter file proposed when a repo has no tasks yet. */
export function tasksTemplate(projectName: string): string {
  return `# Task di ${projectName}

Questo file è letto da Kyon: ogni riga con una casella è una task.
Puoi spuntarle qui o da Kyon, restano sincronizzate.

## Da fare

- [ ] Scrivi qui la prima task

## Fatto

`;
}
