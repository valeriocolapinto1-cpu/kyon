'use client';

import { useQuery } from '@tanstack/react-query';
import type { Preferences } from '@kyon/core';
import { api } from './api';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  bio: string | null;
  statusText: string | null;
  nameColor: string | null;
  avatarUrl: string | null;
  preferences: Preferences | null;
  homeLayout: unknown;
  tourDoneAt: string | null;
  createdAt: string;
}

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => api<Me>('/api/me'),
    staleTime: 60_000,
    retry: (count, error) => (error as { status?: number }).status !== 401 && count < 2,
  });
}
