'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError, api } from './api';
import type { LiveSource } from './live';

export interface RoomItem {
  id: string;
  kind: 'general' | 'project' | 'thread' | 'task';
  projectId: string | null;
  projectName: string | null;
  title: string | null;
  lastMessageAt: string | null;
  unread: number;
  muted: boolean;
  last: { author: string; text: string } | null;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  url: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  seq: number;
  clientId: string;
  author: { id: string; name: string; avatarUrl: string | null; nameColor: string | null } | null;
  body: string;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
  mentions: string[];
  replyTo: { id: string; author: string; excerpt: string; deleted: boolean } | null;
  reactions: { emoji: string; count: number; mine: boolean; names: string[]; userIds: string[] }[];
  attachments: ChatAttachment[];
  pinned: boolean;
  /** Client-only: still being sent, or failed. */
  status?: 'sending' | 'failed';
}

export interface RoomInfo {
  id: string;
  kind: RoomItem['kind'];
  projectId: string | null;
  taskId: string | null;
  title: string | null;
  lastSeq: number;
}

interface Page {
  room: RoomInfo;
  canWrite: boolean;
  canModerate: boolean;
  people: { id: string; name: string; avatarUrl: string | null }[];
  messages: ChatMessage[];
  hasMore: boolean;
}

export const roomsKey = ['chat-rooms'] as const;

interface Payload {
  body: string;
  replyToId: string | null;
  attachmentIds: string[];
  /** Alt texts typed while the files were uploading. */
  alts: Record<string, string>;
}

export function useRooms() {
  return useQuery({
    queryKey: roomsKey,
    queryFn: () => api<{ rooms: RoomItem[] }>('/api/chat/rooms').then((r) => r.rooms),
  });
}

/** Socket query of the realtime room carrying a chat room's events. */
export const liveQueryFor = (room: Pick<RoomItem, 'kind' | 'projectId'> | null) =>
  !room
    ? null
    : room.kind === 'general' || !room.projectId
      ? 'room=general'
      : `project=${room.projectId}`;

const byOrder = (a: ChatMessage, b: ChatMessage) =>
  a.status && !b.status ? 1 : !a.status && b.status ? -1 : a.seq - b.seq;

/**
 * One conversation: messages (oldest first), optimistic sends with a client id (a retry never
 * duplicates), live merges from the room, catch-up after a reconnection, typing and presence.
 */
export function useConversation(
  roomId: string,
  live: LiveSource | null,
  meId: string | null,
  onIncoming?: (message: ChatMessage) => void,
) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<Omit<Page, 'messages' | 'hasMore'> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Map<string, number>>(new Map());
  const [online, setOnline] = useState<string[]>([]);
  const lastSeq = useRef(0);
  const incoming = useRef(onIncoming);
  useEffect(() => {
    incoming.current = onIncoming;
  });

  const merge = useCallback(
    (list: ChatMessage[]) => {
      setMessages((current) => {
        const map = new Map(current.map((m) => [m.clientId, m]));
        for (const message of list)
          map.set(message.clientId, {
            ...message,
            // Broadcasts are the same for everyone: "mine" is decided here.
            reactions: message.reactions.map((r) => ({
              ...r,
              mine: meId ? r.userIds.includes(meId) : false,
            })),
          });
        const next = [...map.values()].sort(byOrder);
        lastSeq.current = Math.max(
          lastSeq.current,
          ...next.filter((m) => !m.status).map((m) => m.seq),
          0,
        );
        return next;
      });
    },
    [meId],
  );

  // Initial load. Mount the component with `key={roomId}`: a new room starts from a clean state.
  useEffect(() => {
    let cancelled = false;
    api<Page>(`/api/chat/rooms/${roomId}/messages`).then(
      (data) => {
        if (cancelled) return;
        const { messages: list, hasMore: more, ...rest } = data;
        setPage(rest);
        setHasMore(more);
        merge(list);
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiClientError ? caught.message : 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [roomId, merge]);

  const catchUp = useCallback(async () => {
    const data = await api<Page>(`/api/chat/rooms/${roomId}/messages?after=${lastSeq.current}`);
    merge(data.messages);
  }, [roomId, merge]);

  // Live events of this room.
  useEffect(() => {
    if (!live) return;
    return live.subscribe((event) => {
      if (event.type === 'resync') void catchUp();
      if (event.type === 'presence') setOnline(event.userIds);
      if (event.type === 'typing' && event.roomId === roomId && event.userId !== meId)
        setTyping((t) => new Map(t).set(event.userId, Date.now() + 5000));
      if (event.type !== 'chat' || event.roomId !== roomId || !event.message) return;
      const message = event.message as ChatMessage;
      if (event.action !== 'message') merge([message]);
      if (event.action === 'message') {
        merge([message]);
        if (message.author?.id !== meId) {
          setTyping((t) => {
            const next = new Map(t);
            if (message.author) next.delete(message.author.id);
            return next;
          });
          incoming.current?.(message);
        }
      }
      if (event.action !== 'message')
        void queryClient.invalidateQueries({ queryKey: ['chat-pins', roomId] });
    });
  }, [live, roomId, meId, merge, catchUp, queryClient]);

  // Typing notices expire.
  useEffect(() => {
    if (!typing.size) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setTyping((t) => new Map([...t].filter(([, until]) => until > now)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [typing]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.status);
    if (!oldest) return;
    const data = await api<Page>(`/api/chat/rooms/${roomId}/messages?before=${oldest.seq}`);
    setHasMore(data.hasMore);
    merge(data.messages);
  }, [messages, roomId, merge]);

  const post = useCallback(
    async (draft: ChatMessage, payload: Payload) => {
      try {
        const saved = await api<ChatMessage>(`/api/chat/rooms/${roomId}/messages`, {
          method: 'POST',
          json: { clientId: draft.clientId, ...payload },
        });
        merge([saved]);
        void queryClient.invalidateQueries({ queryKey: roomsKey });
      } catch (caught) {
        merge([{ ...draft, status: 'failed' }]);
        throw caught;
      }
    },
    [roomId, merge, queryClient],
  );

  const pending = useRef(new Map<string, Payload>());

  const send = useCallback(
    async (input: {
      body: string;
      replyTo: ChatMessage | null;
      attachments: ChatAttachment[];
      me: { id: string; name: string; avatarUrl: string | null; nameColor: string | null };
    }) => {
      const clientId = crypto.randomUUID();
      const draft: ChatMessage = {
        id: clientId,
        roomId,
        seq: Number.MAX_SAFE_INTEGER,
        clientId,
        author: input.me,
        body: input.body,
        deleted: false,
        edited: false,
        createdAt: new Date().toISOString(),
        mentions: [],
        replyTo: input.replyTo
          ? {
              id: input.replyTo.id,
              author: input.replyTo.author?.name ?? '',
              excerpt: input.replyTo.body.slice(0, 120),
              deleted: false,
            }
          : null,
        reactions: [],
        attachments: input.attachments,
        pinned: false,
        status: 'sending',
      };
      const payload = {
        body: input.body,
        replyToId: input.replyTo?.id ?? null,
        attachmentIds: input.attachments.map((a) => a.id),
        alts: Object.fromEntries(
          input.attachments.filter((a) => a.alt).map((a) => [a.id, a.alt ?? '']),
        ),
      };
      pending.current.set(clientId, payload);
      merge([draft]);
      await post(draft, payload);
    },
    [roomId, merge, post],
  );

  /** Resends a failed message with the same client id (never stored twice). */
  const retry = useCallback(
    async (message: ChatMessage) => {
      const payload = pending.current.get(message.clientId);
      if (!payload) return;
      merge([{ ...message, status: 'sending' }]);
      await post(message, payload);
    },
    [merge, post],
  );

  const update = useCallback((message: ChatMessage) => merge([message]), [merge]);

  const typingNames = useMemo(
    () =>
      [...typing.keys()]
        .map((id) => page?.people.find((p) => p.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
    [typing, page],
  );

  // "sta scrivendo": at most every 3 seconds.
  const lastTyping = useRef(0);
  const notifyTyping = useCallback(() => {
    if (!live || Date.now() - lastTyping.current < 3000) return;
    lastTyping.current = Date.now();
    live.send(JSON.stringify({ type: 'typing', roomId }));
  }, [live, roomId]);

  // Read state: the newest message seen, debounced.
  const readTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      const seq = lastSeq.current;
      if (!seq) return;
      void api(`/api/chat/rooms/${roomId}/read`, { method: 'POST', json: { seq } }).then(() =>
        queryClient.invalidateQueries({ queryKey: roomsKey }),
      );
    }, 800);
  }, [roomId, queryClient]);
  useEffect(() => () => clearTimeout(readTimer.current), []);

  return {
    info: page,
    messages,
    hasMore,
    error,
    online,
    typingNames,
    loadOlder,
    send,
    retry,
    update,
    notifyTyping,
    markRead,
  };
}

export type Conversation = ReturnType<typeof useConversation>;

/** Pastes from a phone camera are big: images go up resized (in the browser) and with their size. */
export async function uploadAttachment(
  roomId: string,
  file: File,
  alt: string | null,
): Promise<ChatAttachment> {
  let blob: Blob = file;
  let width: number | null = null;
  let height: number | null = null;
  let name = file.name || 'file';
  if (/^image\/(jpeg|png|webp|heic)$/.test(file.type)) {
    const { resizeForUpload } = await import('./image');
    const resized = await resizeForUpload(file, 2048).catch(() => null);
    if (resized) {
      blob = resized.blob;
      width = resized.width;
      height = resized.height;
      name =
        name.replace(/\.(jpe?g|png|heic|webp)$/i, '') +
        (resized.blob.type === 'image/webp' ? '.webp' : '.jpg');
    }
  }
  const params = new URLSearchParams({ name });
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  if (alt) params.set('alt', alt);
  const res = await fetch(`/api/chat/rooms/${roomId}/attachments?${params}`, {
    method: 'PUT',
    body: blob,
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => null)) as
    (ChatAttachment & { error?: { message?: string } }) | null;
  if (!res.ok || !data)
    throw new ApiClientError(
      res.status,
      'upload',
      data?.error?.message ?? 'Caricamento non riuscito.',
    );
  return { ...data, width, height, alt, url: `/api/files/chat/${data.id}` };
}
