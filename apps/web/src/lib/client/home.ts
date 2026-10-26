'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { normalizeHomeLayout, type HomeBlockSetting } from '@kyon/core';
import { api } from './api';
import { meKey, type Me } from './me';

export interface ActivityItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  project: { id: string; name: string } | null;
}

export interface HomeData {
  contributions: ActivityItem[];
  myTasks: {
    id: string;
    projectId: string;
    projectName: string;
    text: string;
    priority: string;
    dueDate: string | null;
  }[];
  runs: {
    id: string;
    projectId: string;
    projectName: string;
    taskId: string | null;
    taskText: string;
    state: string;
    prNumber: number | null;
    prUrl: string | null;
    copiedAt: string;
    launchedBy: { id: string; name: string } | null;
  }[];
  comments: {
    id: string;
    roomId: string;
    kind: 'thread' | 'task';
    excerpt: string;
    createdAt: string;
    author: { id: string; name: string; avatarUrl: string | null } | null;
    projectId: string;
    projectName: string;
    taskId: string | null;
    context: string;
  }[];
  lastLocation: { path: string; title: string; at: string | null } | null;
}

export const homeKey = ['home'] as const;

export function useHome() {
  return useQuery({ queryKey: homeKey, queryFn: () => api<HomeData>('/api/home') });
}

/** The saved Home layout (from any device), always complete and valid. */
export function useHomeLayout(me: Me | undefined) {
  const queryClient = useQueryClient();
  const layout = normalizeHomeLayout(me?.homeLayout);
  const save = async (next: HomeBlockSetting[]) => {
    queryClient.setQueryData<Me>(meKey, (current) =>
      current ? { ...current, homeLayout: next } : current,
    );
    const saved = await api<Me>('/api/me', { method: 'PATCH', json: { homeLayout: next } });
    queryClient.setQueryData(meKey, saved);
  };
  return { layout, save };
}

export interface PersonProfile {
  id: string;
  name: string;
  bio: string | null;
  statusText: string | null;
  avatarUrl: string | null;
  admin: boolean;
  githubLogin: string | null;
  memberSince: string;
  repos: { id: string; fullName: string; htmlUrl: string; projectId: string | null }[];
  projects: { id: string; name: string; archived: boolean }[];
  activity: ActivityItem[];
  stats: { tasksCompleted: number; runs: number };
}

export function usePerson(id: string | null) {
  return useQuery({
    queryKey: ['person', id],
    queryFn: () => api<PersonProfile>(`/api/people/${encodeURIComponent(id ?? '')}`),
    enabled: Boolean(id),
  });
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  statusText: string | null;
}

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => api<{ people: Person[] }>('/api/people').then((r) => r.people),
    staleTime: 5 * 60_000,
  });
}

interface ActivityPage {
  events: ActivityItem[];
  hasMore: boolean;
  projects: { id: string; name: string }[];
}

export function useActivity(projectId: string | null) {
  return useInfiniteQuery({
    queryKey: ['activity', projectId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (projectId) params.set('project', projectId);
      if (pageParam) params.set('before', pageParam);
      return api<ActivityPage>(`/api/activity?${params}`);
    },
    getNextPageParam: (last) => (last.hasMore ? (last.events.at(-1)?.createdAt ?? null) : null),
  });
}

export interface SearchResults {
  projects: { id: string; name: string; archived: boolean }[];
  tasks: { id: string; projectId: string; projectName: string; text: string; done: boolean }[];
  prompts: {
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    taskId: string | null;
  }[];
  messages: {
    id: string;
    roomId: string;
    body: string;
    author: { name: string } | null;
    projectId: string | null;
    taskId: string | null;
  }[];
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Projects, tasks, prompts (one request) and messages (FTS), debounced while typing. */
export function useGlobalSearch(query: string) {
  const q = useDebounced(query.trim(), 250);
  return useQuery({
    queryKey: ['global-search', q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResults> => {
      const encoded = encodeURIComponent(q);
      const [main, chat] = await Promise.all([
        api<Omit<SearchResults, 'messages'>>(`/api/search?q=${encoded}`),
        api<{ messages: SearchResults['messages'] }>(`/api/chat/search?q=${encoded}`).catch(() => ({
          messages: [],
        })),
      ]);
      return { ...main, messages: chat.messages.slice(0, 6) };
    },
  });
}

/** Where a message lives in the app: task comments open in the task, the rest in Chat. */
export function messageHref(roomId: string, projectId?: string | null, taskId?: string | null) {
  if (roomId.startsWith('task:') && projectId && taskId)
    return `/progetti?id=${encodeURIComponent(projectId)}&task=${encodeURIComponent(taskId)}`;
  return `/chat?room=${encodeURIComponent(roomId)}`;
}

export const taskHref = (projectId: string, taskId: string) =>
  `/progetti?id=${encodeURIComponent(projectId)}&task=${encodeURIComponent(taskId)}`;
