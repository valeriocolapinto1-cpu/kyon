'use client';

import { ArrowLeft, FileCode2, Plus, Sparkles } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { InlineText } from '@/components/ui/InlineText';
import { SkeletonList } from '@/components/ui/Skeleton';
import type { ProjectDetail } from '@/lib/client/projects';
import { usePrompts } from '@/lib/client/prompts';
import { allTasks, useTasks } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';
import { PromptEditor } from './PromptEditor';
import { ClaudeMdSheet, NewPromptSheet } from './PromptSheets';
import { RunStateBadge } from './RunState';

const p = it.prompts;

/** The Prompt tab: prompts grouped by task on the left, editor and runs on the right. */
export function PromptsTab({ project }: { project: ProjectDetail }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const prompts = usePrompts(project.id);
  const tasksQuery = useTasks(project.id);
  const tasks = useMemo(() => allTasks(tasksQuery.data), [tasksQuery.data]);
  const [sheet, setSheet] = useState<null | 'new' | 'claude'>(params.get('new') ? 'new' : null);
  const selectedId = params.get('prompt');
  const canWrite = Boolean(project.permissions['project:write_prompt']);

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

  if (prompts.isPending) return <SkeletonList rows={3} />;
  if (prompts.isError)
    return <EmptyState title={it.common.errorTitle} body={prompts.error.message} />;
  const { prompts: list, runs } = prompts.data;
  const selected = list.find((x) => x.id === selectedId) ?? null;
  const task = selected?.taskId ? (tasks.find((t) => t.id === selected.taskId) ?? null) : null;
  const subtasks = task
    ? tasks.filter((t) => t.path === task.path && t.parentId === task.stableId)
    : [];
  const latestRun = (promptId: string) => runs.find((r) => r.promptId === promptId);

  // Group by task, in the order of the most recently edited prompt.
  const groups = new Map<string, typeof list>();
  for (const item of list) {
    const key = item.taskId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      {canWrite && tasks.length > 0 && (
        <GlassButton variant="primary" size="sm" onClick={() => setSheet('new')}>
          <Plus className="size-5" aria-hidden="true" /> {p.newPrompt}
        </GlassButton>
      )}
      <GlassButton size="sm" onClick={() => setSheet('claude')}>
        <FileCode2 className="size-5" aria-hidden="true" /> {p.claudeMd}
      </GlassButton>
    </div>
  );

  const listView =
    list.length === 0 ? (
      <EmptyState icon={<Sparkles className="size-10" />} title={p.emptyTitle} body={p.emptyBody} />
    ) : (
      <nav aria-label={p.listLabel} className="flex flex-col gap-4">
        {[...groups.entries()].map(([taskId, items]) => (
          <section key={taskId || 'none'} className="flex flex-col gap-2">
            <h3 className="px-1 text-footnote font-semibold text-muted">
              {items[0]?.taskGone ? (
                p.taskGone
              ) : items[0]?.taskText ? (
                <InlineText text={items[0].taskText} />
              ) : (
                p.noTask
              )}
            </h3>
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const run = latestRun(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => set({ prompt: item.id })}
                      aria-current={item.id === selectedId ? 'true' : undefined}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-control border border-border bg-surface-solid p-3 text-left focus-visible:ring-2 focus-visible:ring-focus',
                        item.id === selectedId && 'ring-2 ring-focus',
                      )}
                    >
                      <span className="text-subhead font-semibold text-fg">{item.title}</span>
                      <span className="flex flex-wrap items-center gap-2 text-caption text-muted">
                        <span>{p.status[item.status]}</span>
                        <span aria-hidden="true">·</span>
                        <span>v{item.version}</span>
                        {run && <RunStateBadge state={run.state} prNumber={run.prNumber} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    );

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        <div className={cn(selected && 'hidden md:block')}>{listView}</div>
        <div className={cn(!selected && 'hidden md:block')}>
          {selected ? (
            <section
              aria-labelledby="prompt-editor-title"
              className="k-glass flex flex-col gap-4 rounded-card p-4"
            >
              <div className="flex items-center gap-2">
                <GlassButton
                  size="icon"
                  variant="plain"
                  className="md:hidden"
                  aria-label={p.listLabel}
                  onClick={() => set({ prompt: null })}
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </GlassButton>
                <h3 id="prompt-editor-title" className="text-title3 font-semibold text-fg">
                  {selected.title}
                </h3>
              </div>
              <PromptEditor
                key={selected.id}
                prompt={selected}
                runs={runs}
                project={project}
                task={task}
                subtasks={subtasks}
              />
            </section>
          ) : (
            list.length > 0 && (
              <p className="rounded-card p-6 text-center text-body text-muted">{p.selectHint}</p>
            )
          )}
        </div>
      </div>

      {canWrite && (
        <NewPromptSheet
          key={sheet === 'new' ? `open-${params.get('task') ?? ''}` : 'closed'}
          open={sheet === 'new'}
          onOpenChange={(open) => {
            setSheet(open ? 'new' : null);
            if (!open && params.get('new')) set({ new: null });
          }}
          projectId={project.id}
          tasks={tasks}
          initialTaskId={params.get('task')}
          onCreated={(id) => set({ prompt: id, new: null, task: null })}
        />
      )}
      <ClaudeMdSheet
        open={sheet === 'claude'}
        onOpenChange={(open) => setSheet(open ? 'claude' : null)}
        projectId={project.id}
        canWrite={canWrite}
      />
    </div>
  );
}
