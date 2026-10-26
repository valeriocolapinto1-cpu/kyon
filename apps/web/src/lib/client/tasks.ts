'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { moveId, type Priority } from '@kyon/core';
import { api } from './api';

export interface TaskItem {
  id: string;
  stableId: string;
  path: string;
  headingPath: string[];
  text: string;
  done: boolean;
  style: string;
  line: number;
  parentId: string | null;
  notes: string[];
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  priority: Priority;
  dueDate: string | null;
  columnId: string | null;
  position: number;
  labels: { id: string; name: string; color: string }[];
  notesKyon: string | null;
}

export interface ColumnItem {
  id: string;
  name: string;
  position: number;
  isDone: boolean;
  isInProgress: boolean;
}

export interface LabelItem {
  id: string;
  name: string;
  color: string;
}

export interface TasksData {
  columns: ColumnItem[];
  labels: LabelItem[];
  files: {
    path: string;
    kind: 'tasks' | 'archive';
    tables: { headingPath: string[]; line: number; markdown: string }[];
    tasks: TaskItem[];
  }[];
  orphaned: { id: string; text: string; path: string; orphanedAt: string | null }[];
  sync: {
    lastSyncAt: string | null;
    lastError: string | null;
    pending: number;
    everSynced: boolean;
  };
}

export interface HistoryEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export const tasksKey = (projectId: string) => ['tasks', projectId] as const;
export const historyKey = (projectId: string, taskId: string) =>
  ['task-history', projectId, taskId] as const;

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: tasksKey(projectId),
    queryFn: () => api<TasksData>(`/api/projects/${projectId}/tasks`),
  });
}

export function useTaskHistory(projectId: string, taskId: string | null) {
  return useQuery({
    queryKey: historyKey(projectId, taskId ?? ''),
    queryFn: () =>
      api<{ createdAt: string; events: HistoryEvent[] }>(
        `/api/projects/${projectId}/tasks/${taskId}/history`,
      ),
    enabled: Boolean(taskId),
  });
}

export const allTasks = (data: TasksData | undefined): TaskItem[] =>
  data?.files.flatMap((f) => f.tasks) ?? [];

export interface TaskPatch {
  done?: boolean;
  text?: string;
  assigneeId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  notes?: string | null;
  labelIds?: string[];
  move?: { columnId: string; index: number };
}

/** Tasks of a column in board order. */
export function columnTasks(data: TasksData, columnId: string, tasks = allTasks(data)) {
  return tasks.filter((t) => t.columnId === columnId).sort((a, b) => a.position - b.position);
}

/**
 * What the server will do, done locally for an instant UI: the server response replaces it, an
 * error restores the snapshot.
 */
export function applyLocally(
  data: TasksData,
  taskId: string,
  patch: TaskPatch,
  extra: { assignee?: TaskItem['assignee'] } = {},
): TasksData {
  const task = allTasks(data).find((t) => t.id === taskId);
  if (!task) return data;
  const done = data.columns.find((c) => c.isDone);
  const todo = data.columns.find((c) => !c.isDone && !c.isInProgress);
  const next: Partial<TaskItem> = {};
  if (patch.text !== undefined) next.text = patch.text;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.notes !== undefined) next.notesKyon = patch.notes;
  if (patch.assigneeId !== undefined) next.assignee = extra.assignee ?? null;
  if (patch.labelIds !== undefined)
    next.labels = data.labels.filter((l) => patch.labelIds?.includes(l.id));
  if (patch.done !== undefined && patch.done !== task.done) {
    next.done = patch.done;
    if (patch.done && done) next.columnId = done.id;
    if (!patch.done && task.columnId === done?.id && todo) next.columnId = todo.id;
  }
  let positions = new Map<string, number>();
  if (patch.move) {
    const target = data.columns.find((c) => c.id === patch.move?.columnId);
    if (target) {
      next.columnId = target.id;
      next.done = target.isDone;
      const order = moveId(
        columnTasks(data, target.id).map((t) => t.id),
        taskId,
        patch.move.index,
      );
      positions = new Map(order.map((id, i) => [id, i]));
    }
  }
  return {
    ...data,
    files: data.files.map((f) => ({
      ...f,
      tasks: f.tasks.map((t) => {
        const position = positions.get(t.id);
        if (t.id === taskId)
          return { ...t, ...next, ...(position !== undefined ? { position } : {}) };
        return position !== undefined ? { ...t, position } : t;
      }),
    })),
  };
}

export async function sendPatch(
  queryClient: QueryClient,
  projectId: string,
  taskId: string,
  patch: TaskPatch,
) {
  const data = await api<TasksData>(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    json: patch,
  });
  queryClient.setQueryData(tasksKey(projectId), data);
  void queryClient.invalidateQueries({ queryKey: ['task-history', projectId, taskId] });
  return data;
}

export function useInvalidateTasks(projectId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tasksKey(projectId) });
}
