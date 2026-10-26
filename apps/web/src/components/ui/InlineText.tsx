import { Fragment, type ReactNode } from 'react';

const TOKEN =
  /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

/** Task text without Markdown markers (for cards, menus and announcements). */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$)/g, '$1$2')
    .trim();
}

const safeHref = (href: string) => (/^https?:\/\//i.test(href) ? href : null);

/** The small part of Markdown that appears in task lines: bold, italic, code, links. */
export function InlineText({ text, links = false }: { text: string; links?: boolean }) {
  const parts = text.split(TOKEN).filter(Boolean);
  return parts.map((part, i): ReactNode => {
    if (/^(\*\*|__).+\1$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(part))
      return (
        <code key={i} className="rounded bg-neutral-soft px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = links ? safeHref(link[2] ?? '') : null;
      return href ? (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-accent-text underline"
        >
          {link[1]}
        </a>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      );
    }
    if (/^([*_]).+\1$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
