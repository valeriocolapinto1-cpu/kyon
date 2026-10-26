'use client';

import { useQuery } from '@tanstack/react-query';
import type { RunState } from '@kyon/core';
import { api } from './api';
import { promptsKey, statusKey } from './projectLive';

export type PromptStatus = 'draft' | 'ready' | 'used';

export interface PromptItem {
  id: string;
  taskId: string | null;
  taskText: string | null;
  taskGone: boolean;
  title: string;
  status: PromptStatus;
  body: string;
  version: number;
  versionCount: number;
  createdBy: { id: string; name: string } | null;
  updatedAt: string;
}

export interface RunItem {
  id: string;
  promptId: string | null;
  taskId: string | null;
  taskText: string;
  state: RunState;
  branch: string;
  prNumber: number | null;
  prUrl: string | null;
  prTitle: string | null;
  linkSource: 'marker' | 'suggested' | 'manual' | null;
  launchedBy: { id: string; name: string } | null;
  copiedAt: string;
  mergedAt: string | null;
  resultNotes: string | null;
  taskClosedByRun: boolean;
  promptVersion: number | null;
}

export interface TemplateItem {
  id: string;
  scope: 'builtin' | 'group' | 'user' | 'project';
  name: string;
  body: string;
  projectId: string | null;
  editable: boolean;
}

export interface VersionItem {
  id: string;
  number: number;
  body: string;
  author: { id: string; name: string } | null;
  createdAt: string;
}

export function usePrompts(projectId: string) {
  return useQuery({
    queryKey: promptsKey(projectId),
    queryFn: () =>
      api<{ prompts: PromptItem[]; runs: RunItem[] }>(`/api/projects/${projectId}/prompts`),
  });
}

export function useTemplates(projectId: string) {
  return useQuery({
    queryKey: ['templates', projectId],
    queryFn: () =>
      api<{ templates: TemplateItem[] }>(`/api/templates?project=${projectId}`).then(
        (r) => r.templates,
      ),
  });
}

export function useVersions(promptId: string | null) {
  return useQuery({
    queryKey: ['prompt-versions', promptId],
    queryFn: () =>
      api<{ versions: VersionItem[] }>(`/api/prompts/${promptId}/versions`).then((r) => r.versions),
    enabled: Boolean(promptId),
  });
}

export function useRunSuggestion(runId: string | null) {
  return useQuery({
    queryKey: ['run-suggestion', runId],
    queryFn: () =>
      api<{
        suggestion: { number: number; title: string; url: string | null; reasons: string[] } | null;
      }>(`/api/runs/${runId}/suggestion`).then((r) => r.suggestion),
    enabled: Boolean(runId),
    staleTime: 60_000,
  });
}

export interface StatusData {
  github: {
    branch: string;
    ci: {
      state: 'none' | 'running' | 'failed' | 'passed';
      checks: { name: string; status: string; conclusion: string | null }[];
    };
    commits: {
      sha: string;
      shortSha: string;
      message: string;
      author: string;
      date: string | null;
      url: string;
    }[];
    pulls: {
      number: number;
      title: string;
      author: string;
      url: string;
      createdAt: string;
      ci: 'none' | 'running' | 'failed' | 'passed' | null;
    }[];
    issues: { number: number; title: string; author: string; url: string; createdAt: string }[];
  } | null;
  githubError: string | null;
  completed: StatusEvent[];
  history: StatusEvent[];
}

export interface StatusEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export function useStatus(projectId: string) {
  return useQuery({
    queryKey: statusKey(projectId),
    queryFn: () => api<StatusData>(`/api/projects/${projectId}/status`),
  });
}

/**
 * Copies text that is still being fetched. Safari only allows clipboard writes inside the tap
 * that started them: a ClipboardItem with a promise keeps that permission while the request
 * runs. Elsewhere (or if that fails) the text is written once it arrives. Returns the text and
 * whether it reached the clipboard; on false the caller shows it for a manual copy.
 */
export async function copyFromRequest(
  load: () => Promise<string>,
): Promise<{ text: string; copied: boolean }> {
  const pending = load();
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clipboard && 'write' in clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/plain': pending.then((text) => new Blob([text], { type: 'text/plain' })),
        }),
      ]);
      return { text: await pending, copied: true };
    } catch (error) {
      // Firefox, or a refused permission: try the simple way below.
      console.warn('ClipboardItem copy failed', error);
    }
  }
  const text = await pending;
  try {
    await clipboard?.writeText(text);
    return { text, copied: Boolean(clipboard) };
  } catch (error) {
    console.warn('Clipboard copy failed', error);
    return { text, copied: false };
  }
}
