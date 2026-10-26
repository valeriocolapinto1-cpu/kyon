'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DONE_MOVE_DEBOUNCE_MS } from '@kyon/core';
import type { SyncState } from '@/components/ui/SyncIndicator';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError } from '@/lib/client/api';
import {
  allTasks,
  applyLocally,
  columnTasks,
  sendPatch,
  tasksKey,
  type TaskItem,
  type TaskPatch,
  type TasksData,
} from '@/lib/client/tasks';
import { it } from '@/lib/i18n/it';

const t = it.tasks;

type Move = { columnId: string; index: number };

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  snapshot: TasksData;
  move: Move;
}

interface Job {
  snapshot: TasksData;
  send: () => Promise<unknown>;
  touchesRepo: boolean;
}

interface PatchExtra {
  assignee?: TaskItem['assignee'];
  undo?: { label: string; patch: TaskPatch };
}

/**
 * Every change to tasks goes through here: applied locally at once, sent to the API, rolled
 * back on error. Moves into or out of "Fatto" commit to the repo, so they wait a moment
 * (DONE_MOVE_DEBOUNCE_MS): moving a card back and forth produces at most one commit.
 */
export function useTaskActions(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [inFlight, setInFlight] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const pending = useRef(new Map<string, Pending>());
  const lastFailed = useRef<Job | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const read = useCallback(
    () => queryClient.getQueryData<TasksData>(tasksKey(projectId)),
    [queryClient, projectId],
  );
  const write = useCallback(
    (data: TasksData) => queryClient.setQueryData(tasksKey(projectId), data),
    [queryClient, projectId],
  );

  const run = useCallback(
    async (job: Job) => {
      setInFlight((n) => n + 1);
      if (job.touchesRepo) setSyncState('saving');
      try {
        await job.send();
        if (job.touchesRepo) {
          setSyncState('saved');
          clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSyncState('idle'), 3000);
        }
        lastFailed.current = null;
        return true;
      } catch (error) {
        write(job.snapshot);
        lastFailed.current = job;
        if (job.touchesRepo) setSyncState('error');
        toast({
          tone: 'error',
          title: t.errors.saveFailed,
          description: error instanceof ApiClientError ? error.message : undefined,
        });
        void queryClient.invalidateQueries({ queryKey: tasksKey(projectId) });
        return false;
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [queryClient, projectId, toast, write],
  );

  // Undo actions call the latest patch/move: kept in a ref updated after each render.
  const self = useRef<{
    patch: (taskId: string, change: TaskPatch, extra?: PatchExtra) => Promise<boolean>;
    move: (taskId: string, to: Move) => void;
  } | null>(null);

  const patch = useCallback(
    async (taskId: string, change: TaskPatch, extra: PatchExtra = {}) => {
      const snapshot = read();
      if (!snapshot) return false;
      await queryClient.cancelQueries({ queryKey: tasksKey(projectId) });
      write(applyLocally(snapshot, taskId, change, extra));
      const ok = await run({
        snapshot,
        send: () => sendPatch(queryClient, projectId, taskId, change),
        touchesRepo: change.done !== undefined || change.text !== undefined,
      });
      if (ok && extra.undo) {
        const undo = extra.undo.patch;
        toast({
          tone: 'success',
          title: extra.undo.label,
          action: { label: it.common.undo, onAction: () => void self.current?.patch(taskId, undo) },
        });
      }
      return ok;
    },
    [queryClient, projectId, read, run, toast, write],
  );

  const flush = useCallback(
    async (taskId: string) => {
      const entry = pending.current.get(taskId);
      if (!entry) return;
      pending.current.delete(taskId);
      setWaiting(pending.current.size);
      clearTimeout(entry.timer);
      const ok = await run({
        snapshot: entry.snapshot,
        send: () => sendPatch(queryClient, projectId, taskId, { move: entry.move }),
        touchesRepo: true,
      });
      if (!ok) return;
      const column = read()?.columns.find((c) => c.id === entry.move.columnId);
      const before = allTasks(entry.snapshot).find((x) => x.id === taskId);
      if (!column || !before?.columnId || column.isDone === before.done) {
        setSyncState('idle');
        return;
      }
      const from: Move = {
        columnId: before.columnId,
        index: columnTasks(entry.snapshot, before.columnId).findIndex((x) => x.id === taskId),
      };
      toast({
        tone: 'success',
        title: column.isDone ? t.completedToast : t.reopenedToast,
        action: { label: it.common.undo, onAction: () => self.current?.move(taskId, from) },
      });
    },
    [queryClient, projectId, read, run, toast],
  );

  const move = useCallback(
    (taskId: string, to: Move) => {
      const data = read();
      if (!data) return;
      const column = data.columns.find((c) => c.id === to.columnId);
      if (!column || !allTasks(data).some((x) => x.id === taskId)) return;
      const entry = pending.current.get(taskId);
      const snapshot = entry?.snapshot ?? data;
      const original = allTasks(snapshot).find((x) => x.id === taskId);
      void queryClient.cancelQueries({ queryKey: tasksKey(projectId) });
      write(applyLocally(data, taskId, { move: to }));
      if (entry || column.isDone !== original?.done) {
        if (entry) clearTimeout(entry.timer);
        setSyncState('saving');
        pending.current.set(taskId, {
          snapshot,
          move: to,
          timer: setTimeout(() => void flush(taskId), DONE_MOVE_DEBOUNCE_MS),
        });
        setWaiting(pending.current.size);
        return;
      }
      void run({
        snapshot,
        send: () => sendPatch(queryClient, projectId, taskId, { move: to }),
        touchesRepo: false,
      });
    },
    [flush, queryClient, projectId, read, run, write],
  );

  useEffect(() => {
    self.current = { patch, move };
  }, [patch, move]);

  // Leaving the page must not lose a debounced move.
  useEffect(() => {
    const map = pending.current;
    const flushAll = () => {
      for (const id of [...map.keys()]) void flush(id);
    };
    window.addEventListener('pagehide', flushAll);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      flushAll();
    };
  }, [flush]);

  const retry = useCallback(() => {
    const job = lastFailed.current;
    if (job) void run(job);
  }, [run]);

  const busy = inFlight > 0 || waiting > 0;
  return useMemo(
    () => ({
      patch,
      move,
      syncState,
      retry,
      /** True while something is being saved: live refetches wait so they don't undo the UI. */
      busy,
    }),
    [patch, move, syncState, retry, busy],
  );
}

export type TaskActions = ReturnType<typeof useTaskActions>;
