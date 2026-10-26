'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RoomEvent } from '@kyon/core';
import { useRoom, type RealtimeStatus } from './realtime';

export type LiveEvent = RoomEvent | { type: 'resync' };
export type LiveListener = (event: LiveEvent) => void;

/** A realtime room as seen by components: status, subscriptions, and `send` (typing notices). */
export interface LiveSource {
  status: RealtimeStatus;
  subscribe: (listener: LiveListener) => () => void;
  send: (data: string) => void;
}

/** One socket for `query` (e.g. `project=<id>` or `room=general`) shared by many listeners. */
export function useLiveSource(query: string | null, onEvent?: LiveListener): LiveSource {
  const listeners = useRef(new Set<LiveListener>());
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const emit = useCallback((event: LiveEvent) => {
    onEventRef.current?.(event);
    for (const listener of listeners.current) listener(event);
  }, []);
  const { status, send } = useRoom(query, {
    onEvent: emit,
    onResync: () => emit({ type: 'resync' }),
  });
  const subscribe = useCallback((listener: LiveListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  return useMemo(() => ({ status, subscribe, send }), [status, subscribe, send]);
}
