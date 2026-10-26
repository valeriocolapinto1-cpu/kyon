'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProjectRole } from '@kyon/core';
import { api } from './api';

export interface ProjectSummary {
  id: string;
  name: string;
  role: ProjectRole;
  repoFullName: string;
  archived: boolean;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  role: ProjectRole;
  archived: boolean;
  repo: { fullName: string; htmlUrl: string; defaultBranch: string; available: boolean } | null;
  settings: {
    commitMode: 'direct' | 'branch_pr';
    workBranch: string | null;
    viewersCanComment: boolean;
    planHeadings: string[];
    ignoreGlobs: string[];
    showArchive: boolean;
  };
  members: { id: string; name: string; avatarUrl: string | null; role: ProjectRole; canSeeRepo: boolean }[];
  candidates: { id: string; name: string }[];
  permissions: Record<string, boolean>;
}

export const projectsKey = ['projects'] as const;
export const projectKey = (id: string) => ['project', id] as const;

export function useProjects() {
  return useQuery({ queryKey: projectsKey, queryFn: () => api<{ projects: ProjectSummary[] }>('/api/projects').then((r) => r.projects) });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: projectKey(id ?? ''),
    queryFn: () => api<ProjectDetail>(`/api/projects/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}
