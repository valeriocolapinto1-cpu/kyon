/** Minimal glob → RegExp: `**` (any depth), `*` (no slash), `?` (one char). */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] ?? '';
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // "**/" matches zero or more directories
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export const DEFAULT_IGNORE_GLOBS = [
  'node_modules/**',
  '**/node_modules/**',
  '.git/**',
  'vendor/**',
  '**/vendor/**',
];
/** Archive folders: read-only, shown only when the project enables "mostra archivio". */
export const ARCHIVE_GLOBS = ['docs/archivio/**', '**/archivio/**'];

export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}

export type FileClass = 'tasks' | 'archive' | 'ignored';

export function classifyPath(path: string, extraIgnore: readonly string[] = []): FileClass {
  if (!/\.(md|markdown)$/i.test(path)) return 'ignored';
  if (matchesAny(path, [...DEFAULT_IGNORE_GLOBS, ...extraIgnore])) return 'ignored';
  if (matchesAny(path, ARCHIVE_GLOBS)) return 'archive';
  return 'tasks';
}
