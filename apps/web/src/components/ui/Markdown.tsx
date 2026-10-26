import type { ReactNode } from 'react';
import { InlineText } from './InlineText';

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang: string; text: string }
  | {
      kind: 'list';
      ordered: boolean;
      items: { text: string; checked: boolean | null; depth: number }[];
    }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'paragraph'; text: string };

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence[1] ?? '```'))
        body.push(lines[i++] ?? '');
      i++;
      blocks.push({ kind: 'code', lang: fence[2] ?? '', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1]?.length ?? 1) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2] ?? '' });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: { text: string; checked: boolean | null; depth: number }[] = [];
      while (i < lines.length && LIST.test(lines[i] ?? '')) {
        const m = LIST.exec(lines[i] ?? '');
        items.push({
          text: m?.[4] ?? '',
          checked: m?.[3] === undefined ? null : m[3] !== ' ',
          depth: Math.min(3, Math.floor((m?.[1]?.length ?? 0) / 2)),
        });
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>'))
        body.push((lines[i++] ?? '').replace(/^>\s?/, ''));
      blocks.push({ kind: 'quote', text: body.join(' ') });
      continue;
    }
    const body: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !/^(#{1,6}\s|\s*(```|~~~)|>)/.test(lines[i] ?? '') &&
      !LIST.test(lines[i] ?? '')
    )
      body.push(lines[i++] ?? '');
    blocks.push({ kind: 'paragraph', text: body.join(' ') });
  }
  return blocks;
}

/**
 * The Markdown that prompts and chat messages use, rendered as React elements (never as HTML:
 * nothing typed by a user can inject markup). Links open only for http(s).
 */
export function Markdown({
  source,
  highlight,
}: {
  source: string;
  /** Optional decorator for text runs (e.g. to mark unknown variables). */
  highlight?: (text: string) => ReactNode;
}) {
  const inline = (text: string) => (highlight ? highlight(text) : <InlineText text={text} links />);
  return (
    <div className="flex flex-col gap-3 text-body text-fg [overflow-wrap:anywhere]">
      {parse(source).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1] ?? 'h5';
            return (
              <Tag
                key={i}
                className={block.level === 1 ? 'text-title3 font-semibold' : 'text-headline'}
              >
                {inline(block.text)}
              </Tag>
            );
          }
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-control bg-neutral-soft p-3 font-mono text-footnote"
              >
                <code>{block.text}</code>
              </pre>
            );
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={i}
                className={`flex flex-col gap-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
              >
                {block.items.map((item, j) => (
                  <li key={j} style={{ marginLeft: `${item.depth * 1.25}rem` }}>
                    {item.checked !== null && (
                      <span aria-hidden="true" className="mr-1.5 font-mono">
                        {item.checked ? '☑' : '☐'}
                      </span>
                    )}
                    {item.checked !== null && (
                      <span className="sr-only">{item.checked ? 'fatto: ' : 'da fare: '}</span>
                    )}
                    {inline(item.text)}
                  </li>
                ))}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 border-separator pl-3 text-muted">
                {inline(block.text)}
              </blockquote>
            );
          case 'rule':
            return <hr key={i} className="border-separator" />;
          default:
            return <p key={i}>{inline(block.text)}</p>;
        }
      })}
    </div>
  );
}
