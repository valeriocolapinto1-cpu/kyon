'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FolderKanban, MoreHorizontal, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { InlineText } from '@/components/ui/InlineText';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioCards } from '@/components/ui/RadioCards';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SplitView } from '@/components/ui/SplitView';
import { SyncIndicator } from '@/components/ui/SyncIndicator';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { useRepos } from '@/lib/client/github';
import { projectsKey, useProject, useProjects, type ProjectSummary } from '@/lib/client/projects';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';
import { ProjectMenu } from './ProjectMenu';
import { RunClosedToasts } from './prompts/RunClosedToasts';
import { ProjectLiveProvider } from '@/lib/client/projectLive';
import { TasksTab } from './tasks/TasksTab';
import { PromptsTab } from './prompts/PromptsTab';
import { StatusTab } from './prompts/StatusTab';

const p = it.projects2;
const MAX_FACES = 5;
type Tab = 'task' | 'prompt' | 'status';
const TABS: Tab[] = ['task', 'prompt', 'status'];

function NewProjectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const repos = useRepos();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [repoId, setRepoId] = useState('');
  const available = (repos.data ?? []).filter(
    (r) => r.available && r.exposure !== 'hidden' && !r.projectId,
  );
  const chosen = available.find((r) => r.id === repoId);
  const create = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>('/api/projects', { method: 'POST', json: { repoId, name } }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: projectsKey });
      void queryClient.invalidateQueries({ queryKey: ['repos'] });
      toast({ title: p.created, tone: 'success' });
      onOpenChange(false);
      router.push(`/progetti?id=${id}`);
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get('name') ?? ''));
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={p.newProject}
      description={p.chooseRepoHelp}
    >
      {repos.isPending ? (
        <SkeletonList rows={2} />
      ) : available.length === 0 ? (
        <p className="text-body text-muted">
          {p.noRepos}{' '}
          <Link href="/settings#github" className="font-semibold text-accent-text">
            {it.github.title}
          </Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <RadioCards
            label={p.chooseRepo}
            value={repoId}
            onChange={setRepoId}
            options={available.map((r) => ({
              value: r.id,
              label: r.fullName,
              description: `${it.github.exposure[r.exposure]} · ${r.exposedBy.name}`,
            }))}
          />
          {chosen && (
            <GlassInput
              key={chosen.id}
              label={p.name}
              name="name"
              defaultValue={chosen.name}
              required
              maxLength={80}
            />
          )}
          <FormError
            message={
              create.error instanceof ApiClientError
                ? create.error.message
                : create.error
                  ? it.common.errorBody
                  : null
            }
          />
          <GlassButton
            type="submit"
            variant="primary"
            disabled={!chosen || create.isPending}
            className="self-start"
          >
            {p.create}
          </GlassButton>
        </form>
      )}
    </Sheet>
  );
}

function ProjectRow({ project, selected }: { project: ProjectSummary; selected: boolean }) {
  return (
    <GlassCard
      as={Link}
      href={`/progetti?id=${project.id}`}
      data-plain
      interactive
      aria-current={selected ? 'page' : undefined}
      className={cn('flex items-center justify-between gap-3', selected && 'ring-2 ring-focus')}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-headline text-fg">{project.name}</span>
          <Badge tone={project.role === 'owner' ? 'accent' : 'neutral'}>
            {p.role[project.role]}
          </Badge>
        </span>
        <span className="block truncate text-footnote text-muted">{project.repoFullName}</span>
      </span>
      <span className="max-w-[50%] min-w-0 text-right">
        {project.lastCompleted ? (
          <>
            <span className="block text-caption text-muted">{p.lastCompleted}</span>
            <span className="block truncate text-footnote text-fg">
              <InlineText text={project.lastCompleted.text} />
            </span>
            <span className="block truncate text-caption text-muted">
              {project.lastCompleted.by ?? it.tasks.history.github} ·{' '}
              {relativeTime(project.lastCompleted.at)}
            </span>
          </>
        ) : (
          <span className="block text-footnote text-muted">{p.noneCompleted}</span>
        )}
      </span>
    </GlassCard>
  );
}

function ProjectList({ selectedId, onNew }: { selectedId: string | null; onNew: () => void }) {
  const projects = useProjects();
  if (projects.isPending) return <SkeletonList rows={3} />;
  if (projects.isError)
    return <EmptyState title={it.common.errorTitle} body={projects.error.message} />;
  const active = projects.data.filter((x) => !x.archived);
  const archived = projects.data.filter((x) => x.archived);
  if (projects.data.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban className="size-10" />}
        title={it.projects.emptyTitle}
        body={it.projects.emptyBody}
        action={
          <GlassButton variant="primary" onClick={onNew}>
            <Plus className="size-5" aria-hidden="true" /> {p.newProject}
          </GlassButton>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {active.map((x) => (
          <li key={x.id}>
            <ProjectRow project={x} selected={x.id === selectedId} />
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-touch cursor-pointer py-2 text-subhead font-semibold text-muted">
            {p.archived} ({archived.length})
          </summary>
          <ul className="flex flex-col gap-3 pt-2">
            {archived.map((x) => (
              <li key={x.id}>
                <ProjectRow project={x} selected={x.id === selectedId} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ProjectDetailView({
  id,
  tab,
  onTab,
}: {
  id: string;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  const project = useProject(id);
  const [menuOpen, setMenuOpen] = useState(false);
  if (project.isPending) return <SkeletonList rows={3} />;
  if (project.isError) {
    return (
      <EmptyState
        title={p.notFoundTitle}
        body={
          (project.error as { status?: number }).status === 404
            ? p.notFoundBody
            : project.error.message
        }
        action={
          <Link href="/progetti" className="font-semibold text-accent-text">
            {p.back}
          </Link>
        }
      />
    );
  }
  const data = project.data;
  return (
    <section aria-labelledby="project-title" className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="project-title"
              data-resume-title
              className="truncate text-title2 font-bold text-fg"
            >
              {data.name}
            </h2>
            {data.repo && (
              <a
                href={data.repo.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-footnote text-accent-text"
              >
                {data.repo.fullName} <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(si apre in una nuova scheda)</span>
              </a>
            )}
          </div>
          <GlassButton size="icon" aria-label={p.menu} onClick={() => setMenuOpen(true)}>
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </GlassButton>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* At most a few faces and "+N": a long row must never widen the page on a phone. */}
          <ul className="flex min-w-0 -space-x-2" aria-label={p.members}>
            {data.members.slice(0, MAX_FACES).map((m) => (
              <li key={m.id}>
                <Avatar
                  name={m.name}
                  src={m.avatarUrl}
                  size="sm"
                  className="rounded-full ring-2 ring-[var(--k-surface-solid)]"
                />
              </li>
            ))}
            {data.members.length > MAX_FACES && (
              <li
                className="flex size-8 items-center justify-center rounded-full bg-neutral-soft text-caption font-semibold text-fg ring-2 ring-[var(--k-surface-solid)]"
                aria-label={p.moreMembers(data.members.length - MAX_FACES)}
              >
                <span aria-hidden="true">+{data.members.length - MAX_FACES}</span>
              </li>
            )}
          </ul>
          <SyncIndicator state={data.repo?.available === false ? 'error' : 'idle'} />
        </div>
        {data.archived && (
          <p className="rounded-control bg-neutral-soft p-3 text-subhead text-fg">
            {p.archivedBanner}
          </p>
        )}
        {data.repo?.available === false && (
          <p className="rounded-control bg-neutral-soft p-3 text-subhead text-danger">
            {p.repoUnavailable}
          </p>
        )}
      </GlassCard>
      <ProjectLiveProvider projectId={data.id}>
        <RunClosedToasts project={data} />
        <Tabs<Tab>
          label={p.tabsLabel}
          value={tab}
          onChange={onTab}
          idPrefix="project"
          tabs={TABS.map((value) => ({ value, label: p.tabs[value] }))}
        />
        <TabPanel idPrefix="project" value={tab}>
          {tab === 'task' ? (
            <TasksTab project={data} />
          ) : tab === 'prompt' ? (
            <PromptsTab project={data} />
          ) : (
            <StatusTab project={data} />
          )}
        </TabPanel>
      </ProjectLiveProvider>
      <ProjectMenu project={data} open={menuOpen} onOpenChange={setMenuOpen} />
    </section>
  );
}

/**
 * /progetti (list) and /progetti?id=…&tab=… (one project). Query parameters keep the page static:
 * dynamic segments would be rendered by the Worker on every request.
 */
export function ProjectsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [newOpen, setNewOpen] = useState(false);
  const id = params.get('id');
  const tabParam = params.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'task';
  const setTab = (next: Tab) =>
    router.replace(`${pathname}?id=${id}&tab=${next}`, { scroll: false });

  // With no projects the empty state already carries the one "Nuovo progetto" button.
  const noProjects = useProjects().data?.length === 0;
  const header = (
    <PageHeader
      title={it.projects.title}
      actions={
        noProjects ? undefined : (
          <GlassButton variant="primary" onClick={() => setNewOpen(true)}>
            <Plus className="size-5" aria-hidden="true" /> {p.newProject}
          </GlassButton>
        )
      }
    />
  );

  return (
    <>
      {header}
      {id ? (
        // Inside a project the board needs the whole width: the list comes back with "Tutti i progetti".
        <>
          <Link
            href="/progetti"
            data-plain
            className="mb-3 inline-flex min-h-touch items-center gap-1 font-semibold text-accent-text"
          >
            <ArrowLeft className="size-5" aria-hidden="true" /> {p.back}
          </Link>
          <ProjectDetailView id={id} tab={tab} onTab={setTab} />
        </>
      ) : (
        <SplitView
          list={<ProjectList selectedId={id} onNew={() => setNewOpen(true)} />}
          detail={
            <GlassCard className="flex min-h-64 items-center justify-center text-center">
              <p className="text-body text-muted">{it.projects.selectHint}</p>
            </GlassCard>
          }
        />
      )}
      <NewProjectSheet open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
