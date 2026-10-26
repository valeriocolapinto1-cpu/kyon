'use client';

import { useQuery } from '@tanstack/react-query';
import type { Exposure } from '@kyon/core';
import { api } from './api';

export interface GitHubStatus {
  configured: boolean;
  installUrl: string | null;
  connection: { login: string; avatarUrl: string | null; lastSyncAt: string | null; needsReconnect: boolean } | null;
}

export interface RepoView {
  id: string;
  fullName: string;
  name: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
  exposure: Exposure;
  available: boolean;
  sharedWith: string[];
  exposedBy: { id: string; name: string };
  mine: boolean;
  projectId: string | null;
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  statusText: string | null;
}

export const githubKey = ['github'] as const;
export const reposKey = ['repos'] as const;

export function useGitHubStatus() {
  return useQuery({ queryKey: githubKey, queryFn: () => api<GitHubStatus>('/api/github') });
}

export function useRepos() {
  return useQuery({ queryKey: reposKey, queryFn: () => api<{ repos: RepoView[] }>('/api/repos').then((r) => r.repos) });
}

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => api<{ people: Person[] }>('/api/people').then((r) => r.people),
    staleTime: 5 * 60_000,
  });
}
