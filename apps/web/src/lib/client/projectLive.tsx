'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLiveSource, type LiveListener, type LiveSource } from './live';
import type { RealtimeStatus } from './realtime';

export type { LiveEvent } from './live';
type Listener = LiveListener;

const Context = createContext<LiveSource | null>(null);

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
  const refreshOthers = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: promptsKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: statusKey(projectId) });
  }, [projectId, queryClient]);
  const value = useLiveSource(`project=${projectId}`, (event) => {
    if (event.type === 'runs_changed' || event.type === 'resync') refreshOthers();
  });
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

/** The project's live source itself (for components that also send, like the chat). */
export function useProjectLiveSource(): LiveSource | null {
  return useContext(Context);
}
