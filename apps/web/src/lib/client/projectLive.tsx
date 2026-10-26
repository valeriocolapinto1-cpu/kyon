'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { RoomEvent } from '@kyon/core';
import { useRoom, type RealtimeStatus } from './realtime';

export type LiveEvent = RoomEvent | { type: 'resync' };
type Listener = (event: LiveEvent) => void;

interface ProjectLive {
  status: RealtimeStatus;
  subscribe: (listener: Listener) => () => void;
}

const Context = createContext<ProjectLive | null>(null);

export const promptsKey = (projectId: string) => ['prompts', projectId] as const;
export const statusKey = (projectId: string) => ['status', projectId] as const;

/**
 * One WebSocket per open project, shared by its tabs. Prompts and Status refresh here; the Task
 * tab subscribes itself (it must hold refetches while a change is being saved).
 */
export function ProjectLiveProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const listeners = useRef(new Set<Listener>());
  const emit = useCallback((event: LiveEvent) => {
    for (const listener of listeners.current) listener(event);
  }, []);
  const refreshOthers = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: promptsKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: statusKey(projectId) });
  }, [projectId, queryClient]);
  const status = useRoom(`project=${projectId}`, {
    onEvent: (event) => {
      if (event.type === 'runs_changed') refreshOthers();
      emit(event);
    },
    onResync: () => {
      refreshOthers();
      emit({ type: 'resync' });
    },
  });
  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Subscribes to the project's live events (no-op outside a provider). */
export function useProjectLive(listener?: Listener): RealtimeStatus {
  const live = useContext(Context);
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  const subscribe = live?.subscribe;
  useEffect(() => subscribe?.((event) => ref.current?.(event)), [subscribe]);
  return live?.status ?? 'closed';
}
