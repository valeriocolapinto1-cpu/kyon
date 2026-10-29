'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Columns3,
  Filter,
  Keyboard,
  ListChecks,
  ListTodo,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  matchesFilters,
  today as todayIn,
  type Priority,
  type TaskFilters,
} from '@kyon/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SyncIndicator } from '@/components/ui/SyncIndicator';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import type { ProjectDetail } from '@/lib/client/projects';
import { useProjectLive, type LiveEvent } from '@/lib/client/projectLive';
import {
  allTasks,
  columnTasks,
  tasksKey,
  useTasks,
  type TaskItem,
  type TasksData,
} from '@/lib/client/tasks';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { it } from '@/lib/i18n/it';
import { usePreferences, useReducedMotion } from '@/lib/preferences/context';
import { CalendarView } from './CalendarView';
import { ChecklistChooser, ChecklistSheet } from './ChecklistChooser';
import { plainText } from '@/components/ui/InlineText';
import { KanbanBoard } from './KanbanBoard';
import { TaskDetail } from './TaskDetail';
import { TaskList } from './TaskList';
import { AddTaskSheet, ColumnsSheet, FiltersSheet, ShortcutsSheet } from './TaskSheets';
import { useTaskActions } from './useTaskActions';

const t = it.tasks;
const ZERO_WIDTH = String.fromCharCode(0x200b);
type View = 'kanban' | 'list' | 'calendar';
const VIEWS: View[] = ['kanban', 'list', 'calendar'];
const PRIORITY_KEYS: Record<string, Priority> = {
  '1': 'urgent',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
  '0': 'none',
};

function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return { params, set };
}

/** The Task tab of a project: kanban, list and calendar over the tasks read from the repo. */
export function TasksTab({ project }: { project: ProjectDetail }) {
  const projectId = project.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { params, set } = useUrlState();
  const viewParam = params.get('view') as View | null;
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : 'kanban';
  const selectedId = params.get('task');
  const tasksQuery = useTasks(projectId);
  const data = tasksQuery.data;
  const me = useMe().data ?? null;
  const actions = useTaskActions(projectId);
  const { preferences } = usePreferences();
  const reducedMotion = useReducedMotion();
  const wide = useMediaQuery('(min-width: 768px)');
  const canEdit = Boolean(project.permissions['project:edit_tasks']);
  const canManage = Boolean(project.permissions['project:settings']);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<null | 'add' | 'columns' | 'filters' | 'keys' | 'checklist'>(
    null,
  );
  const [announcement, setAnnouncement] = useState('');
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const today = todayIn();

  const announce = useCallback((message: string) => {
    // Same text twice in a row must be read again: alternate a zero-width space.
    setAnnouncement((current) => (current === message ? `${message}${ZERO_WIDTH}` : message));
  }, []);

  // ---------- Live updates ----------
  const stale = useRef(false);
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: tasksKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: ['task-history', projectId] });
  }, [queryClient, projectId]);
  const busy = useRef(actions.busy);
  useEffect(() => {
    busy.current = actions.busy;
    if (!actions.busy && stale.current) {
      stale.current = false;
      refresh();
    }
  }, [actions.busy, refresh]);
  const onEvent = useCallback(
    (event: LiveEvent) => {
      const relevant =
        event.type === 'tasks_changed' ||
        event.type === 'runs_changed' ||
        event.type === 'resync' ||
        // New or deleted comments change the count on the cards.
        (event.type === 'chat' &&
          event.roomId.startsWith('task:') &&
          (event.action === 'message' || event.action === 'delete'));
      if (!relevant) return;
      // A refetch now would undo a change still being saved: wait for it.
      if (busy.current) stale.current = true;
      else refresh();
      if (event.type !== 'tasks_changed') return;
      if (!me || event.actorId === me.id || !preferences.announceLive) return;
      const known = queryClient.getQueryData<TasksData>(tasksKey(projectId));
      const who = project.members.find((m) => m.id === event.actorId)?.name ?? t.someone;
      for (const task of event.tasks ?? []) {
        if (task.assigneeId !== me.id) continue;
        const before = allTasks(known).find((x) => x.id === task.id);
        const text = plainText(task.text);
        if (before && before.assignee?.id !== me.id) announce(t.liveAssigned(who, text));
        else if (task.column) announce(t.liveMoved(who, text, task.column));
        else announce(t.liveChanged(who, text));
      }
    },
    [announce, me, preferences.announceLive, project.members, projectId, queryClient, refresh],
  );
  const realtime = useProjectLive(onEvent);

  // ---------- First sync ----------
  const autoSynced = useRef(false);
  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const next = await api<TasksData>(`/api/projects/${projectId}/sync`, { method: 'POST' });
      queryClient.setQueryData(tasksKey(projectId), next);
      return true;
    } catch (error) {
      toast({
        tone: 'error',
        title: t.syncError,
        description: error instanceof ApiClientError ? error.message : undefined,
      });
      return false;
    } finally {
      setSyncing(false);
    }
  }, [projectId, queryClient, toast]);
  useEffect(() => {
    if (data && !data.sync.everSynced && !autoSynced.current && project.repo?.available) {
      autoSynced.current = true;
      void syncNow();
    }
  }, [data, project.repo?.available, syncNow]);

  // ---------- Derived lists ----------
  const tasks = useMemo(() => allTasks(data), [data]);
  const visible = useMemo(() => tasks.filter((x) => matchesFilters(x, filters)), [tasks, filters]);
  const visibleIds = useMemo(() => new Set(visible.map((x) => x.id)), [visible]);
  const cards = useMemo(() => {
    // Subtasks live inside their parent's card, unless a filter hides the parent.
    const byStable = new Map(tasks.map((x) => [`${x.path}\n${x.stableId}`, x]));
    return visible.filter((x) => {
      if (!x.parentId) return true;
      const parent = byStable.get(`${x.path}\n${x.parentId}`);
      return !parent || !visibleIds.has(parent.id);
    });
  }, [tasks, visible, visibleIds]);
  const subtasks = useCallback(
    (task: TaskItem) => {
      const children = tasks.filter((x) => x.path === task.path && x.parentId === task.stableId);
      return { done: children.filter((x) => x.done).length, total: children.length };
    },
    [tasks],
  );
  const selected = tasks.find((x) => x.id === selectedId) ?? null;

  // ---------- Actions ----------
  const open = useCallback(
    (task: TaskItem) => {
      set({ task: task.id });
    },
    [set],
  );
  // Focus goes back to the card that opened the detail (the sheet does it on its own close).
  const lastOpened = useRef<string | null>(null);
  const focusCard = useCallback((id: string | null) => {
    if (id) document.querySelector<HTMLElement>(`[data-task-button="${id}"]`)?.focus();
  }, []);
  const close = useCallback(() => {
    lastOpened.current = selectedId;
    set({ task: null });
    if (wide) requestAnimationFrame(() => focusCard(selectedId));
  }, [focusCard, selectedId, set, wide]);
  useEffect(() => {
    if (selectedId && wide) panelTitleRef.current?.focus();
  }, [selectedId, wide]);

  const toggleDone = useCallback(
    (task: TaskItem) => {
      if (!canEdit) return;
      void actions.patch(
        task.id,
        { done: !task.done },
        {
          undo: {
            label: task.done ? t.reopenedToast : t.completedToast,
            patch: { done: task.done },
          },
        },
      );
      announce(task.done ? t.reopenedToast : t.completedToast);
    },
    [actions, announce, canEdit],
  );

  const moveTask = useCallback(
    (task: TaskItem, to: { columnId: string; index: number }, message?: string) => {
      if (!data) return;
      const current = columnTasks(data, task.columnId ?? '').findIndex((x) => x.id === task.id);
      if (task.columnId === to.columnId && current === to.index) return;
      actions.move(task.id, to);
      const column = data.columns.find((c) => c.id === to.columnId);
      const base = message ?? t.movedToast(column?.name ?? '');
      announce(column && column.isDone !== task.done ? `${base} ${t.savingDone}` : base);
    },
    [actions, announce, data],
  );

  const onShortcut = useCallback(
    (task: TaskItem, event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return false;
      if (event.key === '?') {
        setSheet('keys');
        return true;
      }
      if (!canEdit) return false;
      const key = event.key.toLowerCase();
      if (key === 'x') {
        toggleDone(task);
        return true;
      }
      if (key === 'a' && me) {
        const mine = task.assignee?.id === me.id;
        void actions.patch(
          task.id,
          { assigneeId: mine ? null : me.id },
          { assignee: mine ? null : { id: me.id, name: me.name, avatarUrl: me.avatarUrl } },
        );
        announce(mine ? t.history.task_assigned(null) : t.card.assignee(me.name));
        return true;
      }
      const priority = PRIORITY_KEYS[event.key];
      if (priority) {
        void actions.patch(task.id, { priority });
        announce(`${t.filter.priority}: ${it.priority[priority]}`);
        return true;
      }
      return false;
    },
    [actions, announce, canEdit, me, toggleDone],
  );

  const menuFor = useCallback(
    (task: TaskItem): MenuEntry[] => {
      if (!data) return [];
      const columns = [...data.columns].sort((a, b) => a.position - b.position);
      const siblings = columnTasks(data, task.columnId ?? '');
      const index = siblings.findIndex((x) => x.id === task.id);
      return [
        { label: t.menu.open, onSelect: () => open(task) },
        { label: task.done ? t.menu.markOpen : t.menu.markDone, onSelect: () => toggleDone(task) },
        { type: 'separator' },
        {
          type: 'radio',
          label: t.menu.moveTo,
          value: task.columnId ?? '',
          options: columns.map((column) => ({ value: column.id, label: column.name })),
          onChange: (columnId) => {
            const column = columns.find((c) => c.id === columnId);
            if (!column || column.id === task.columnId) return;
            const total = columnTasks(data, column.id).length + 1;
            moveTask(
              task,
              { columnId: column.id, index: total - 1 },
              t.moved(column.name, total, total),
            );
          },
        },
        { type: 'separator' },
        {
          label: t.menu.moveUp,
          disabled: index <= 0,
          onSelect: () => moveTask(task, { columnId: task.columnId ?? '', index: index - 1 }),
        },
        {
          label: t.menu.moveDown,
          disabled: index < 0 || index >= siblings.length - 1,
          onSelect: () => moveTask(task, { columnId: task.columnId ?? '', index: index + 1 }),
        },
      ];
    },
    [data, moveTask, open, toggleDone],
  );

  // "/" focuses the search, "?" shows the shortcuts (outside text fields).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return;
      if (event.key === '/' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === '?' && !target?.closest('[data-task-button]')) {
        setSheet('keys');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- Render ----------
  if (tasksQuery.isPending) return <SkeletonList rows={4} />;
  if (tasksQuery.isError || !data)
    return <EmptyState title={it.common.errorTitle} body={tasksQuery.error?.message ?? ''} />;

  if (!data.sync.everSynced || (syncing && data.files.length === 0)) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-body text-muted">{t.syncing}</p>
        <SkeletonList rows={3} />
      </div>
    );
  }

  // A project that has not chosen its checklist files reads nothing yet: the choice comes first.
  if (data.checklistFiles === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title3 font-semibold text-fg">{t.checklist.firstTitle}</h2>
          <p className="text-body text-muted">
            {canManage ? t.checklist.firstBody : t.checklist.ownerChooses}
          </p>
        </div>
        {canManage && <ChecklistChooser projectId={projectId} canManage />}
      </div>
    );
  }

  if (data.files.length === 0) {
    return (
      <EmptyState
        icon={<ListTodo className="size-10" />}
        title={t.emptyTitle}
        body={t.emptyBody}
        action={
          canEdit || canManage ? (
            <div className="flex flex-wrap justify-center gap-2">
              {canManage && (
                <GlassButton onClick={() => setSheet('checklist')}>{t.checklist.pick}</GlassButton>
              )}
              {canEdit && (
                <GlassButton
                  variant="primary"
                  onClick={async () => {
                    if (!window.confirm(t.createTasksFileConfirm)) return;
                    try {
                      const next = await api<TasksData>(`/api/projects/${projectId}/tasks-file`, {
                        method: 'POST',
                      });
                      queryClient.setQueryData(tasksKey(projectId), next);
                      toast({ tone: 'success', title: t.tasksFileCreated });
                    } catch (error) {
                      toast({
                        tone: 'error',
                        title:
                          error instanceof ApiClientError ? error.message : it.common.errorBody,
                      });
                    }
                  }}
                >
                  {t.createTasksFile}
                </GlassButton>
              )}
            </div>
          ) : undefined
        }
      />
    );
  }

  const filterCount = activeFilterCount(filters);
  const detail = selected ? (
    <TaskDetail
      projectId={projectId}
      data={data}
      task={selected}
      project={project}
      canEdit={canEdit}
      actions={actions}
      onOpenTask={open}
    />
  ) : null;

  const content =
    cards.length === 0 && view !== 'calendar' ? (
      <EmptyState title={t.noMatches} body="" />
    ) : view === 'kanban' ? (
      <KanbanBoard
        data={data}
        tasks={cards}
        subtasks={subtasks}
        canEdit={canEdit}
        today={today}
        selectedId={selectedId}
        reducedMotion={reducedMotion}
        onOpen={open}
        menuFor={menuFor}
        onShortcut={onShortcut}
        onMove={(task, to, message) => moveTask(task, to, message)}
      />
    ) : view === 'list' ? (
      <TaskList
        data={data}
        visible={visibleIds}
        canEdit={canEdit}
        today={today}
        selectedId={selectedId}
        onToggle={toggleDone}
        onOpen={open}
        onShortcut={onShortcut}
      />
    ) : (
      <CalendarView
        tasks={visible}
        canEdit={canEdit}
        today={today}
        selectedId={selectedId}
        reducedMotion={reducedMotion}
        onOpen={open}
        onSetDue={(task, day, message) => {
          void actions.patch(task.id, { dueDate: day });
          announce(message);
        }}
      />
    );

  return (
    <div className="flex flex-col gap-4" data-realtime={realtime}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          label={t.viewLabel}
          value={view}
          onChange={(next) => set({ view: next === 'kanban' ? null : next })}
          options={VIEWS.map((value) => ({ value, label: t.views[value] }))}
        />
        <SyncIndicator state={syncing ? 'saving' : actions.syncState} onRetry={actions.retry} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <label htmlFor="task-search" className="sr-only">
            {t.search}
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id="task-search"
            type="search"
            placeholder={t.search}
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            aria-keyshortcuts="/"
            className="min-h-touch w-full rounded-pill border border-input-border bg-surface-solid pr-4 pl-10 text-fg placeholder:text-muted"
          />
        </div>
        <GlassButton
          size="sm"
          onClick={() => setSheet('filters')}
          aria-label={filterCount ? t.filtersActive(filterCount) : t.filters}
        >
          <Filter className="size-5" aria-hidden="true" />
          <span aria-hidden="true">
            {t.filters}
            {filterCount ? ` (${filterCount})` : ''}
          </span>
        </GlassButton>
        {canEdit && (
          <GlassButton size="sm" variant="primary" onClick={() => setSheet('add')}>
            <Plus className="size-5" aria-hidden="true" /> {t.add}
          </GlassButton>
        )}
        <Menu
          label={t.more}
          entries={[
            {
              label: t.columns,
              icon: <Columns3 className="size-5" />,
              onSelect: () => setSheet('columns'),
            },
            ...(canManage
              ? [
                  {
                    label: t.checklist.menu,
                    icon: <ListChecks className="size-5" />,
                    onSelect: () => setSheet('checklist'),
                  },
                ]
              : []),
            {
              label: t.syncNow,
              icon: <RefreshCw className="size-5" />,
              onSelect: () => void syncNow().then((ok) => ok && toast({ title: t.synced })),
            },
            {
              label: t.shortcuts,
              icon: <Keyboard className="size-5" />,
              onSelect: () => setSheet('keys'),
            },
          ]}
          trigger={
            <GlassButton size="icon" aria-label={t.more}>
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </GlassButton>
          }
        />
      </div>
      {!canEdit && <p className="text-footnote text-muted">{t.readOnly}</p>}
      {data.sync.pending > 0 && (
        <p className="text-footnote text-muted">{t.pending(data.sync.pending)}</p>
      )}
      {data.sync.lastError && <p className="text-footnote text-danger">{t.syncError}</p>}

      <div
        className={
          selected && wide ? 'grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_22rem]' : ''
        }
      >
        <div className="min-w-0">{content}</div>
        {selected && wide && (
          <aside
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented) close();
            }}
            aria-labelledby="task-panel-title"
            className="k-chrome sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-separator px-4 py-2">
              <h3
                id="task-panel-title"
                ref={panelTitleRef}
                tabIndex={-1}
                className="text-headline text-fg outline-none"
              >
                {t.detail.title}
              </h3>
              <GlassButton size="icon" variant="plain" aria-label={t.detail.close} onClick={close}>
                <X className="size-5" aria-hidden="true" />
              </GlassButton>
            </div>
            <div className="overflow-y-auto overscroll-contain p-4">{detail}</div>
          </aside>
        )}
      </div>

      {!wide && (
        <Sheet
          open={Boolean(selected)}
          onOpenChange={(isOpen) => !isOpen && close()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusCard(lastOpened.current);
          }}
          title={t.detail.title}
        >
          {detail}
        </Sheet>
      )}
      {selectedId && !selected && (
        <p className="text-footnote text-muted" role="status">
          {t.detail.notFound}
        </p>
      )}

      {canEdit && (
        <AddTaskSheet
          key={sheet === 'add' ? 'open' : 'closed'}
          open={sheet === 'add'}
          onOpenChange={(isOpen) => setSheet(isOpen ? 'add' : null)}
          projectId={projectId}
          data={data}
        />
      )}
      <ColumnsSheet
        open={sheet === 'columns'}
        onOpenChange={(isOpen) => setSheet(isOpen ? 'columns' : null)}
        projectId={projectId}
        data={data}
        canManage={canManage}
      />
      <FiltersSheet
        open={sheet === 'filters'}
        onOpenChange={(isOpen) => setSheet(isOpen ? 'filters' : null)}
        filters={filters}
        onChange={setFilters}
        data={data}
        project={project}
        meId={me?.id ?? null}
        resultCount={visible.length}
      />
      {canManage && (
        <ChecklistSheet
          open={sheet === 'checklist'}
          onOpenChange={(isOpen) => setSheet(isOpen ? 'checklist' : null)}
          projectId={projectId}
          canManage={canManage}
        />
      )}
      <ShortcutsSheet
        open={sheet === 'keys'}
        onOpenChange={(isOpen) => setSheet(isOpen ? 'keys' : null)}
      />
    </div>
  );
}
