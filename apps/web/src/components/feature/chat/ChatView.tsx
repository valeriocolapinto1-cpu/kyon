'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff, Hash, MessagesSquare, Plus, Users } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { plainText } from '@/components/ui/InlineText';
import { ApiClientError, api } from '@/lib/client/api';
import { liveQueryFor, roomsKey, useRooms, type RoomItem } from '@/lib/client/chat';
import { useLiveSource } from '@/lib/client/live';
import { cn } from '@/lib/cn';
import { useFillHeight } from '@/lib/hooks/useFillHeight';
import { it } from '@/lib/i18n/it';
import { Conversation } from './Conversation';

const c = it.chat;

export const roomTitle = (room: Pick<RoomItem, 'kind' | 'title' | 'projectName'>) =>
  room.kind === 'general'
    ? c.general
    : room.kind === 'thread'
      ? (room.title ?? c.threads)
      : (room.projectName ?? c.projectChat);

function RoomRow({
  room,
  selected,
  onSelect,
}: {
  room: RoomItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = room.kind === 'general' ? Users : room.kind === 'thread' ? Hash : MessagesSquare;
  const subtitle =
    room.kind === 'general'
      ? c.generalSub
      : room.kind === 'thread'
        ? (room.projectName ?? '')
        : c.projectChat;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-neutral-soft focus-visible:ring-2 focus-visible:ring-focus',
        selected && 'bg-accent-soft',
        room.kind === 'thread' && 'pl-8',
      )}
    >
      <Icon className="size-5 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-body text-fg', room.unread > 0 && 'font-semibold')}>
            {roomTitle(room)}
          </span>
          {room.muted && <BellOff className="size-4 shrink-0 text-muted" aria-label={c.muted} />}
        </span>
        <span className="block truncate text-footnote text-muted">
          {room.last ? `${room.last.author}: ${plainText(room.last.text)}` : subtitle}
        </span>
      </span>
      {room.unread > 0 && (
        <span className="rounded-pill bg-accent-fill px-2 text-footnote font-semibold text-on-accent">
          <span aria-hidden="true">{room.unread}</span>
          <span className="sr-only">{c.unread(room.unread)}</span>
        </span>
      )}
    </button>
  );
}

function NewThreadSheet({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!title || !projectId) return;
    try {
      const { id } = await api<{ id: string }>(`/api/projects/${projectId}/threads`, {
        method: 'POST',
        json: { title },
      });
      await queryClient.invalidateQueries({ queryKey: roomsKey });
      onCreated(id);
    } catch (caught) {
      setError(caught);
    }
  };
  return (
    <Sheet
      open={projectId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={c.newThread}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <GlassInput label={c.threadTitle} name="title" required maxLength={80} />
        <FormError
          message={
            error instanceof ApiClientError ? error.message : error ? it.common.errorBody : null
          }
        />
        <GlassButton type="submit" variant="primary" className="self-start">
          {c.createThread}
        </GlassButton>
      </form>
    </Sheet>
  );
}

/** /chat and /chat?room=…: list of conversations; one open at a time (full screen on phones). */
export function ChatView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rooms = useRooms();
  const [newThreadFor, setNewThreadFor] = useState<string | null>(null);
  const roomId = params.get('room');
  const selected = rooms.data?.find((r) => r.id === roomId) ?? null;
  const live = useLiveSource(liveQueryFor(selected));
  const pane = useRef<HTMLDivElement>(null);
  const fill = useFillHeight(pane, Boolean(selected));
  const open = (id: string | null) =>
    router.replace(id ? `${pathname}?room=${encodeURIComponent(id)}` : pathname, { scroll: false });

  const list = rooms.isPending ? (
    <SkeletonList rows={4} />
  ) : rooms.isError ? (
    <EmptyState title={it.common.errorTitle} body={rooms.error.message} />
  ) : (
    <nav aria-label={c.listLabel}>
      <ul className="flex flex-col gap-1">
        {rooms.data.map((room) => (
          <li key={room.id}>
            <RoomRow room={room} selected={room.id === roomId} onSelect={() => open(room.id)} />
            {room.kind === 'project' && room.projectId && (
              <button
                type="button"
                onClick={() => setNewThreadFor(room.projectId)}
                className="ml-8 inline-flex min-h-touch items-center gap-1 px-3 text-footnote font-semibold text-accent-text"
              >
                <Plus className="size-4" aria-hidden="true" /> {c.newThread}
                <span className="sr-only"> · {room.projectName}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <>
      {/* With a conversation open on a phone the title is only for screen readers. */}
      <div className={cn(selected && 'sr-only md:not-sr-only')}>
        <PageHeader title={c.title} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <div className={cn('k-glass rounded-card p-2', selected && 'hidden md:block')}>{list}</div>
        <div
          ref={pane}
          // The open conversation fills the screen down to the tab bar (or the keyboard).
          style={fill ? { height: fill } : undefined}
          className={cn('min-w-0', !selected && 'hidden md:block')}
        >
          {selected ? (
            <div className="k-glass flex h-full flex-col rounded-card p-3">
              <GlassButton
                size="sm"
                variant="plain"
                className="self-start md:hidden"
                onClick={() => open(null)}
              >
                <ArrowLeft className="size-5" aria-hidden="true" /> {c.back}
              </GlassButton>
              <Conversation
                key={selected.id}
                roomId={selected.id}
                title={roomTitle(selected)}
                live={live}
                muted={selected.muted}
                fullScreen
              />
            </div>
          ) : (
            <p className="rounded-card p-6 text-center text-body text-muted">{c.selectHint}</p>
          )}
        </div>
      </div>
      <NewThreadSheet
        projectId={newThreadFor}
        onClose={() => setNewThreadFor(null)}
        onCreated={(id) => {
          setNewThreadFor(null);
          open(id);
        }}
      />
    </>
  );
}
