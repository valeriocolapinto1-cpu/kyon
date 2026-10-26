'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomEvent } from '@kyon/core';
import { ApiClientError, api } from './api';

export type RealtimeStatus = 'connecting' | 'open' | 'closed';

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * One WebSocket per room. A fresh 60-second ticket is fetched for every (re)connection, so
 * permissions are re-checked each time. After a reconnection `onResync` runs: events sent while
 * offline are lost, the caller refetches instead.
 */
export function useRoom(
  query: string | null,
  handlers: { onEvent: (event: RoomEvent) => void; onResync: () => void },
): { status: RealtimeStatus; send: (data: string) => void } {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const current = useRef<WebSocket | null>(null);
  const send = useCallback((data: string) => {
    const ws = current.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(data);
  }, []);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!query) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let opened = false;
    let starting = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (stopped) return;
      clearTimeout(retry);
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) * (0.75 + Math.random() / 2);
      attempt++;
      retry = setTimeout(connect, delay);
    };

    async function connect() {
      if (stopped || socket || starting) return;
      starting = true;
      setStatus('connecting');
      let target: URL;
      try {
        const { url, ticket } = await api<{ url: string; ticket: string }>(
          `/api/realtime/ticket?${query}`,
        );
        target = new URL(url, window.location.href);
        if (target.protocol === 'https:') target.protocol = 'wss:';
        if (target.protocol === 'http:') target.protocol = 'ws:';
        target.searchParams.set('ticket', ticket);
      } catch (error) {
        starting = false;
        setStatus('closed');
        // No access or realtime not configured: retrying won't help.
        if (error instanceof ApiClientError && [403, 404, 503].includes(error.status)) return;
        schedule();
        return;
      }
      starting = false;
      if (stopped) return;
      const ws = new WebSocket(target);
      socket = ws;
      current.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        if (opened) handlersRef.current.onResync();
        opened = true;
        clearInterval(ping);
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
      };
      ws.onmessage = (message) => {
        if (typeof message.data !== 'string' || message.data === 'pong') return;
        try {
          handlersRef.current.onEvent(JSON.parse(message.data) as RoomEvent);
        } catch (error) {
          console.warn('realtime: unreadable message', error);
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (socket === ws) socket = null;
        if (current.current === ws) current.current = null;
        setStatus('closed');
        schedule();
      };
    }

    // Phones drop sockets in the background: reconnect as soon as the page is back.
    const wake = () => {
      if (document.visibilityState === 'visible' && !socket) {
        attempt = 0;
        clearTimeout(retry);
        void connect();
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      socket?.close(1000, 'unmount');
    };
  }, [query]);

  return { status: query ? status : 'closed', send };
}
