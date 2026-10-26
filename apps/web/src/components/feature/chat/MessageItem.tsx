'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  FileText,
  GitCommitHorizontal,
  GitPullRequest,
  CircleDot,
  MoreHorizontal,
  Pin,
  SmilePlus,
  LayoutList,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { QUICK_REACTIONS, previewTargets } from '@kyon/core';
import { Avatar } from '@/components/ui/Avatar';
import { InlineText } from '@/components/ui/InlineText';
import { Markdown } from '@/components/ui/Markdown';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { api } from '@/lib/client/api';
import type { ChatMessage } from '@/lib/client/chat';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

const c = it.chat;

const timeFormat = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});
const sizeOf = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

interface Preview {
  kind: string;
  url: string;
  title: string;
  subtitle: string;
  state: string | null;
}

function LinkPreview({ url }: { url: string }) {
  const preview = useQuery({
    queryKey: ['chat-preview', url],
    queryFn: () =>
      api<{ preview: Preview | null }>(`/api/chat/preview?url=${encodeURIComponent(url)}`).then(
        (r) => r.preview,
      ),
    staleTime: 5 * 60_000,
  });
  if (!preview.data) return null;
  const p = preview.data;
  const Icon =
    p.kind === 'github_pull'
      ? GitPullRequest
      : p.kind === 'github_issue'
        ? CircleDot
        : p.kind === 'github_commit'
          ? GitCommitHorizontal
          : LayoutList;
  return (
    <a
      href={p.url}
      target={p.kind.startsWith('github') ? '_blank' : undefined}
      rel="noreferrer"
      className="flex max-w-md items-start gap-2 rounded-control border border-border bg-surface-solid p-2 hover:bg-neutral-soft"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-subhead font-semibold text-fg">
          <InlineText text={p.title} />
        </span>
        <span className="block text-caption text-muted">
          {p.subtitle}
          {p.state ? ` · ${c.preview[p.state] ?? p.state}` : ''}
        </span>
      </span>
    </a>
  );
}

/** Text runs with @mentions marked (stronger when it's me). */
function mentionHighlighter(names: { id: string; name: string }[], meId: string | null) {
  if (!names.length) return undefined;
  const sorted = [...names].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `(@(?:${sorted.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))(?![\\p{L}\\p{N}_])`,
    'giu',
  );
  return (text: string): ReactNode =>
    text.split(pattern).map((part, i) => {
      const person = part.startsWith('@')
        ? sorted.find((n) => n.name.toLowerCase() === part.slice(1).toLowerCase())
        : undefined;
      if (!person) return <InlineText key={i} text={part} links />;
      return (
        <span
          key={i}
          className={cn(
            'rounded px-0.5 font-semibold text-accent-text',
            person.id === meId && 'bg-accent-soft',
          )}
        >
          {part}
        </span>
      );
    });
}

export interface MessageItemProps {
  message: ChatMessage;
  meId: string | null;
  /** Same author as the previous message, within a few minutes: no avatar/name repeated. */
  grouped: boolean;
  people: { id: string; name: string }[];
  canWrite: boolean;
  canModerate: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onPin: (pinned: boolean) => void;
  onRetry: () => void;
  onJump: (messageId: string) => void;
}

export function MessageItem({
  message: m,
  meId,
  grouped,
  people,
  canWrite,
  canModerate,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onRetry,
  onJump,
}: MessageItemProps) {
  const mine = m.author?.id === meId;
  const name = m.author?.name ?? c.someone;
  const time = timeFormat.format(new Date(m.createdAt));
  const links = m.deleted
    ? []
    : previewTargets(m.body, typeof window === 'undefined' ? null : window.location.origin);
  const highlight = mentionHighlighter(people, meId);

  const actions: MenuEntry[] =
    m.deleted || m.status
      ? []
      : [
          ...(canWrite ? [{ label: c.reply, onSelect: onReply }] : []),
          ...(canWrite
            ? QUICK_REACTIONS.map((emoji) => ({
                label: c.reactWith(emoji),
                onSelect: () => onReact(emoji),
              }))
            : []),
          ...(mine
            ? [
                { type: 'separator' as const },
                { label: c.edit, onSelect: onEdit },
                { label: c.delete, danger: true, onSelect: onDelete },
              ]
            : []),
          ...(canModerate
            ? [
                { type: 'separator' as const },
                { label: m.pinned ? c.unpin : c.pin, onSelect: () => onPin(!m.pinned) },
              ]
            : []),
        ];

  return (
    <article
      id={`message-${m.id}`}
      aria-labelledby={`message-${m.id}-meta`}
      tabIndex={-1}
      className={cn(
        'group relative flex gap-3 rounded-control px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-focus',
        !grouped && 'mt-3',
        m.mentions.includes(meId ?? '') && 'bg-accent-soft',
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <Avatar name={name} src={m.author?.avatarUrl} size="sm" className="[&>*]:size-8" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          id={`message-${m.id}-meta`}
          className={cn('flex flex-wrap items-baseline gap-2', grouped && 'sr-only')}
        >
          <span className="text-subhead font-semibold text-fg">
            {mine ? `${name} (${c.you})` : name}
          </span>
          <time dateTime={m.createdAt} className="text-caption text-muted">
            {time}
          </time>
          {m.pinned && (
            <span className="inline-flex items-center gap-0.5 text-caption text-muted">
              <Pin className="size-3" aria-hidden="true" /> {c.pinned}
            </span>
          )}
        </p>
        {m.replyTo && (
          <button
            type="button"
            onClick={() => m.replyTo && onJump(m.replyTo.id)}
            className="mb-1 flex max-w-full items-start gap-1 rounded-control border-l-4 border-separator bg-neutral-soft px-2 py-1 text-left text-footnote text-muted"
          >
            <span className="sr-only">{c.jumpTo}: </span>
            <span className="font-semibold">{m.replyTo.author}</span>
            <span className="truncate">{m.replyTo.deleted ? c.deleted : m.replyTo.excerpt}</span>
          </button>
        )}
        {m.deleted ? (
          <p className="text-subhead text-muted italic">{c.deleted}</p>
        ) : (
          m.body && <Markdown source={m.body} highlight={highlight} copyLabel={c.copyCode} />
        )}
        {m.edited && <span className="text-caption text-muted">({c.edited})</span>}

        {m.attachments.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((a) => (
              <li key={a.id}>
                {a.mime.startsWith('image/') ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the Worker after a permission check */}
                    <img
                      src={a.url}
                      alt={c.image(a.alt ?? '')}
                      width={a.width ?? undefined}
                      height={a.height ?? undefined}
                      loading="lazy"
                      className="max-h-60 w-auto max-w-full rounded-control border border-border object-contain"
                    />
                  </a>
                ) : (
                  <a
                    href={a.url}
                    className="inline-flex min-h-touch items-center gap-2 rounded-control border border-border bg-surface-solid px-3 text-subhead text-fg hover:bg-neutral-soft"
                  >
                    <FileText className="size-4 text-muted" aria-hidden="true" />
                    {c.attachment(a.name, sizeOf(a.size))}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {links.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {links.map((l) => (
              <LinkPreview key={l.url} url={l.url} />
            ))}
          </div>
        )}
        {m.reactions.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label={c.react}>
            {m.reactions.map((r) => (
              <li key={r.emoji}>
                <button
                  type="button"
                  disabled={!canWrite}
                  aria-pressed={r.mine}
                  onClick={() => onReact(r.emoji)}
                  className={cn(
                    'inline-flex min-h-touch min-w-11 items-center justify-center gap-1 rounded-pill border px-2 text-footnote',
                    r.mine
                      ? 'border-accent bg-accent-soft text-fg'
                      : 'border-border bg-surface-solid text-fg',
                  )}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                  <span className="sr-only"> {c.reactionBy(r.names.join(', '))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {m.status === 'sending' && <p className="text-caption text-muted">{c.sending}</p>}
        {m.status === 'failed' && (
          <p className="flex items-center gap-2 text-caption font-medium text-danger" role="alert">
            <AlertCircle className="size-4" aria-hidden="true" /> {c.failed}
            <button
              type="button"
              onClick={onRetry}
              className="min-h-touch font-semibold text-accent-text underline"
            >
              {c.retry}
            </button>
          </p>
        )}
      </div>
      {actions.length > 0 && (
        <div className="absolute top-0 right-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <Menu
            label={c.actions(name)}
            entries={actions}
            trigger={
              <button
                type="button"
                aria-label={c.actions(name)}
                className="k-pressable inline-flex size-touch items-center justify-center rounded-full bg-surface-solid text-muted shadow-sm hover:text-fg"
              >
                {canWrite && !mine ? (
                  <SmilePlus className="size-5" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                )}
              </button>
            }
          />
        </div>
      )}
    </article>
  );
}

export function DaySeparator({ label }: { label: string }) {
  return (
    <li className="my-3 flex items-center gap-3 text-caption font-semibold text-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-separator" />
      <span>{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-separator" />
    </li>
  );
}
