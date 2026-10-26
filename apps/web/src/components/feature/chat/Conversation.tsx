'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Pin, Search } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { plainText } from '@/components/ui/InlineText';
import { ApiClientError, api } from '@/lib/client/api';
import { roomsKey, useConversation, type ChatMessage } from '@/lib/client/chat';
import type { LiveSource } from '@/lib/client/live';
import { useMe } from '@/lib/client/me';
import { cn } from '@/lib/cn';
import { formatDayLong } from '@/lib/format/day';
import { it } from '@/lib/i18n/it';
import { usePreferences } from '@/lib/preferences/context';
import { Composer } from './Composer';
import { DaySeparator, MessageItem } from './MessageItem';

const c = it.chat;
const ZERO_WIDTH = String.fromCharCode(0x200b);

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(iso));

function dayLabel(day: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (day === today) return c.day.today;
  if (day === yesterday) return c.day.yesterday;
  return formatDayLong(day);
}

export interface ConversationProps {
  roomId: string;
  title: string;
  live: LiveSource | null;
  /** Inside a task detail: no header, shorter list, "commento" wording. */
  compact?: boolean;
  muted?: boolean;
  fullScreen?: boolean;
  /** Presence known by a shared socket (the group room), when `live` is that socket. */
  online?: string[];
}

/** Mount with `key={roomId}`. */
export function Conversation({
  roomId,
  title,
  live,
  compact = false,
  muted = false,
  fullScreen = false,
  online,
}: ConversationProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const me = useMe().data ?? null;
  const { preferences } = usePreferences();
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback(
    (text: string) => setAnnouncement((a) => (a === text ? text + ZERO_WIDTH : text)),
    [],
  );
  const convo = useConversation(roomId, live, me?.id ?? null, (message) => {
    if (preferences.announceMessages && !document.hidden)
      announce(
        c.newMessage(message.author?.name ?? c.someone, plainText(message.body).slice(0, 140)),
      );
  });
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [sheet, setSheet] = useState<null | 'search' | 'pins'>(null);
  const [isMuted, setMuted] = useState(muted);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Stay at the bottom when new messages arrive, unless the user scrolled up to read.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [convo.messages]);
  const { markRead } = convo;
  useEffect(() => {
    if (convo.messages.length && stick.current && !document.hidden) markRead();
  }, [convo.messages, markRead]);

  const action = async (path: string, init: RequestInit & { json?: unknown }) => {
    try {
      const updated = await api<ChatMessage>(path, init);
      convo.update(updated);
      return true;
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
      return false;
    }
  };

  const jump = (messageId: string) => {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.focus();
    }
  };

  if (convo.error) return <EmptyState title={it.common.errorTitle} body={convo.error} />;
  if (!convo.info) return <SkeletonList rows={3} />;
  const { info } = convo;
  const others = info.people.filter(
    (p) => p.id !== me?.id && (online ?? convo.online).includes(p.id),
  );

  const items = convo.messages.map((m, i) => {
    const prev = convo.messages[i - 1];
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
    const grouped =
      !newDay &&
      Boolean(prev) &&
      prev?.author?.id === m.author?.id &&
      !m.replyTo &&
      new Date(m.createdAt).getTime() - new Date(prev?.createdAt ?? 0).getTime() < 5 * 60_000;
    return (
      <Fragment key={m.clientId}>
        {newDay && <DaySeparator label={dayLabel(dayKey(m.createdAt))} />}
        <li>
          <MessageItem
            message={m}
            meId={me?.id ?? null}
            grouped={grouped}
            people={info.people}
            canWrite={info.canWrite}
            canModerate={info.canModerate}
            onReply={() => {
              setEditing(null);
              setReplyTo(m);
            }}
            onEdit={() => {
              setReplyTo(null);
              setEditing(m);
            }}
            onDelete={() => {
              if (window.confirm(c.deleteConfirm))
                void action(`/api/chat/messages/${m.id}`, { method: 'DELETE' });
            }}
            onReact={(emoji) =>
              void action(`/api/chat/messages/${m.id}/reactions`, {
                method: 'POST',
                json: { emoji },
              })
            }
            onPin={(pinned) =>
              void action(`/api/chat/messages/${m.id}/pin`, { method: pinned ? 'PUT' : 'DELETE' })
            }
            onRetry={() => void convo.retry(m)}
            onJump={jump}
          />
        </li>
      </Fragment>
    );
  });

  return (
    <section aria-label={title} className={cn('flex min-h-0 flex-col', fullScreen && 'h-full')}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {!compact && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-separator pb-2">
          <div className="min-w-0">
            <h2
              className="truncate text-title3 font-semibold text-fg"
              id={`room-title-${roomId}`}
              tabIndex={-1}
            >
              {title}
            </h2>
            <p className="text-caption text-muted">
              {others.length ? c.online(others.map((o) => o.name).join(', ')) : c.nobodyOnline}
            </p>
          </div>
          <div className="flex gap-1">
            <GlassButton
              size="icon"
              variant="plain"
              aria-label={c.search}
              onClick={() => setSheet('search')}
            >
              <Search className="size-5" aria-hidden="true" />
            </GlassButton>
            <GlassButton
              size="icon"
              variant="plain"
              aria-label={c.pins}
              onClick={() => setSheet('pins')}
            >
              <Pin className="size-5" aria-hidden="true" />
            </GlassButton>
            <GlassButton
              size="icon"
              variant="plain"
              aria-pressed={isMuted}
              aria-label={isMuted ? c.unmute : c.mute}
              onClick={async () => {
                await api(`/api/chat/rooms/${roomId}/mute`, { method: isMuted ? 'DELETE' : 'PUT' });
                setMuted(!isMuted);
                void queryClient.invalidateQueries({ queryKey: roomsKey });
              }}
            >
              {isMuted ? (
                <BellOff className="size-5" aria-hidden="true" />
              ) : (
                <Bell className="size-5" aria-hidden="true" />
              )}
            </GlassButton>
          </div>
        </header>
      )}

      <div
        ref={list}
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (stick.current) convo.markRead();
        }}
        className={cn(
          'min-h-0 overflow-y-auto overscroll-contain py-2',
          fullScreen ? 'flex-1' : compact ? 'max-h-96' : 'max-h-[60dvh]',
        )}
      >
        {convo.hasMore && (
          <div className="flex justify-center py-2">
            <GlassButton size="sm" variant="plain" onClick={() => void convo.loadOlder()}>
              {c.loadOlder}
            </GlassButton>
          </div>
        )}
        {convo.messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-subhead text-muted">{c.noMessages}</p>
        ) : (
          <ol aria-label={c.messagesLabel(title)} className="flex flex-col">
            {items}
          </ol>
        )}
      </div>

      <p className="min-h-5 px-2 text-caption text-muted" aria-live="off">
        {convo.typingNames.length ? c.typing(convo.typingNames) : ''}
      </p>
      {info.canWrite ? (
        <Composer
          roomId={roomId}
          label={compact ? c.composerTask : c.composer}
          people={info.people.filter((p) => p.id !== me?.id)}
          replyTo={replyTo}
          editing={editing}
          onCancel={() => {
            setReplyTo(null);
            setEditing(null);
          }}
          onTyping={convo.notifyTyping}
          onSend={async (body, attachments) => {
            if (!me) return;
            const reply = replyTo;
            setReplyTo(null);
            stick.current = true;
            await convo.send({
              body,
              replyTo: reply,
              attachments,
              me: { id: me.id, name: me.name, avatarUrl: me.avatarUrl },
            });
          }}
          onSaveEdit={async (message, body) => {
            if (
              await action(`/api/chat/messages/${message.id}`, { method: 'PATCH', json: { body } })
            )
              setEditing(null);
          }}
        />
      ) : (
        <p className="px-2 text-footnote text-muted">{c.readOnly}</p>
      )}

      <SearchSheet
        open={sheet === 'search'}
        onOpenChange={(o) => setSheet(o ? 'search' : null)}
        roomId={roomId}
        onJump={jump}
      />
      <PinsSheet
        open={sheet === 'pins'}
        onOpenChange={(o) => setSheet(o ? 'pins' : null)}
        roomId={roomId}
        onJump={jump}
      />
    </section>
  );
}

function ResultList({
  messages,
  onPick,
}: {
  messages: ChatMessage[];
  onPick: (m: ChatMessage) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m)}
            className="flex w-full flex-col gap-0.5 rounded-control border border-border bg-surface-solid p-3 text-left hover:bg-neutral-soft"
          >
            <span className="text-footnote font-semibold text-fg">
              {m.author?.name ?? c.someone} ·{' '}
              <time dateTime={m.createdAt} className="font-normal text-muted">
                {formatDayLong(dayKey(m.createdAt))}
              </time>
            </span>
            <span className="line-clamp-3 text-subhead text-fg">{plainText(m.body)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchSheet({
  open,
  onOpenChange,
  roomId,
  onJump,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roomId: string;
  onJump: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useQuery({
    queryKey: ['chat-search', roomId, query],
    queryFn: () =>
      api<{ messages: ChatMessage[] }>(
        `/api/chat/search?room=${encodeURIComponent(roomId)}&q=${encodeURIComponent(query)}`,
      ).then((r) => r.messages),
    enabled: open && query.trim().length > 1,
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={c.search}>
      <div className="flex flex-col gap-3">
        <label htmlFor="chat-search" className="sr-only">
          {c.search}
        </label>
        <input
          id="chat-search"
          type="search"
          value={query}
          placeholder={c.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-touch w-full rounded-pill border border-input-border bg-surface-solid px-4 text-fg"
        />
        <div role="status">
          {results.data && results.data.length === 0 && (
            <p className="text-subhead text-muted">{c.searchEmpty}</p>
          )}
        </div>
        <ResultList
          messages={results.data ?? []}
          onPick={(m) => {
            onOpenChange(false);
            requestAnimationFrame(() => onJump(m.id));
          }}
        />
      </div>
    </Sheet>
  );
}

function PinsSheet({
  open,
  onOpenChange,
  roomId,
  onJump,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roomId: string;
  onJump: (id: string) => void;
}) {
  const pins = useQuery({
    queryKey: ['chat-pins', roomId],
    queryFn: () =>
      api<{ messages: ChatMessage[] }>(`/api/chat/rooms/${roomId}/pins`).then((r) => r.messages),
    enabled: open,
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={c.pins}>
      {pins.isPending ? (
        <SkeletonList rows={2} />
      ) : pins.data?.length ? (
        <ResultList
          messages={pins.data}
          onPick={(m) => {
            onOpenChange(false);
            requestAnimationFrame(() => onJump(m.id));
          }}
        />
      ) : (
        <p className="text-subhead text-muted">{c.noPins}</p>
      )}
    </Sheet>
  );
}
