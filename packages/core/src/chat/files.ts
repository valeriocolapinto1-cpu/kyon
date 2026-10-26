import { MAX_ATTACHMENT_BYTES } from '../limits';

/** Allowed attachment types: images, PDF/documents, text and code, zip. */
const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
  'application/x-zip-compressed': ['zip'],
  'text/plain': ['txt', 'log'],
  'text/markdown': ['md', 'markdown'],
  'text/csv': ['csv'],
  'application/json': ['json'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

/** Code and text files often come with a generic or empty type: accepted by extension, served as text. */
const CODE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'sql',
  'yml',
  'yaml',
  'toml',
  'ini',
  'css',
  'scss',
  'html',
  'xml',
  'txt',
  'log',
  'md',
  'csv',
  'json',
  'r',
  'ipynb',
];

const extension = (name: string) => /\.([a-z0-9]{1,10})$/i.exec(name)?.[1]?.toLowerCase() ?? '';

export type AttachmentCheck =
  | { ok: true; mime: string; name: string; image: boolean }
  | { ok: false; reason: 'too_large' | 'unsupported_type' | 'empty' };

/** File names keep letters, digits and `. _ -`; no paths, no control characters, max 120 chars. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, '')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!clean) return 'file';
  if (clean.length <= 120) return clean;
  const ext = extension(clean);
  return ext ? `${clean.slice(0, 115 - ext.length)}….${ext}` : clean.slice(0, 120);
}

/**
 * Decides whether an upload is allowed and with which type it will be served. Anything that
 * could run in the browser (HTML, SVG) is served as plain text or refused.
 */
export function checkAttachment(name: string, mime: string, size: number): AttachmentCheck {
  if (size <= 0) return { ok: false, reason: 'empty' };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'too_large' };
  const clean = sanitizeFileName(name);
  const ext = extension(clean);
  const type = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  const known = ALLOWED[type];
  if (known?.includes(ext))
    return { ok: true, mime: type, name: clean, image: type.startsWith('image/') };
  if (CODE_EXTENSIONS.includes(ext))
    return { ok: true, mime: 'text/plain', name: clean, image: false };
  return { ok: false, reason: 'unsupported_type' };
}

export const ATTACHMENT_ACCEPT = [
  ...Object.keys(ALLOWED),
  ...CODE_EXTENSIONS.map((e) => `.${e}`),
].join(',');
