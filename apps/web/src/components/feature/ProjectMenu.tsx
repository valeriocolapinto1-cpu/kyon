'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, LogOut, Settings2, Trash2, UserCog, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { RadioCards } from '@/components/ui/RadioCards';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { projectKey, projectsKey, type ProjectDetail } from '@/lib/client/projects';
import { it } from '@/lib/i18n/it';

const p = it.projects2;
type Panel = null | 'menu' | 'settings' | 'members' | 'transfer' | 'leave' | 'delete';
const message = (error: unknown) =>
  error instanceof ApiClientError ? error.message : it.common.errorBody;
const splitList = (value: string) =>
  value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function useProjectMutation(project: ProjectDetail) {
  const queryClient = useQueryClient();
  return (data: ProjectDetail) => {
    queryClient.setQueryData(projectKey(project.id), data);
    void queryClient.invalidateQueries({ queryKey: projectsKey });
  };
}

function SettingsForm({ project, onDone }: { project: ProjectDetail; onDone: () => void }) {
  const { toast } = useToast();
  const apply = useProjectMutation(project);
  const [commitMode, setCommitMode] = useState(project.settings.commitMode);
  const save = useMutation({
    mutationFn: (json: unknown) =>
      api<ProjectDetail>(`/api/projects/${project.id}`, { method: 'PATCH', json }),
    onSuccess: (data) => {
      apply(data);
      toast({ title: p.saved, tone: 'success' });
      onDone();
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      name: String(form.get('name') ?? ''),
      commitMode,
      workBranch: String(form.get('workBranch') ?? '') || null,
      viewersCanComment: form.get('viewersCanComment') === 'on',
      showArchive: form.get('showArchive') === 'on',
      planHeadings: splitList(String(form.get('planHeadings') ?? '')),
      ignoreGlobs: splitList(String(form.get('ignoreGlobs') ?? '')),
    });
  };
  return (
    <form id="project-settings" onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError message={save.error ? message(save.error) : null} />
      <GlassInput label={p.name} name="name" defaultValue={project.name} required maxLength={80} />
      <RadioCards
        label={p.commitMode}
        value={commitMode}
        onChange={setCommitMode}
        options={[
          { value: 'direct', label: p.commitDirect },
          { value: 'branch_pr', label: p.commitBranch },
        ]}
      />
      <GlassInput
        label={p.workBranch}
        name="workBranch"
        defaultValue={project.settings.workBranch ?? ''}
        placeholder={project.repo?.defaultBranch}
      />
      <Checkbox
        label={p.viewersCanComment}
        name="viewersCanComment"
        defaultChecked={project.settings.viewersCanComment}
      />
      <GlassInput
        label={p.planHeadings}
        name="planHeadings"
        defaultValue={project.settings.planHeadings.join(', ')}
        hint={p.planHeadingsHelp}
      />
      <GlassInput
        label={p.ignoreGlobs}
        name="ignoreGlobs"
        defaultValue={project.settings.ignoreGlobs.join(', ')}
        hint={p.ignoreGlobsHelp}
      />
      <Checkbox
        label={p.showArchive}
        name="showArchive"
        defaultChecked={project.settings.showArchive}
      />
      <GlassButton type="submit" variant="primary" disabled={save.isPending} className="self-start">
        {p.save}
      </GlassButton>
    </form>
  );
}

function Members({ project }: { project: ProjectDetail }) {
  const { toast } = useToast();
  const apply = useProjectMutation(project);
  const canManage = project.permissions['project:manage_members'];
  const run = useMutation({
    mutationFn: ({ path, method, json }: { path: string; method: string; json?: unknown }) =>
      api<ProjectDetail>(`/api/projects/${project.id}${path}`, { method, json }),
    onSuccess: apply,
    onError: (error) => toast({ title: message(error), tone: 'error' }),
  });
  const [candidate, setCandidate] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-separator">
        {project.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-3">
              <Avatar name={m.name} src={m.avatarUrl} size="sm" />
              <span className="text-body text-fg">{m.name}</span>
              <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{p.role[m.role]}</Badge>
              {!m.canSeeRepo && <Badge tone="warning">{p.cantSeeRepo}</Badge>}
            </span>
            {canManage && m.role !== 'owner' && (
              <span className="flex gap-1">
                <GlassButton
                  size="sm"
                  variant="plain"
                  onClick={() =>
                    run.mutate({
                      path: `/members/${m.id}`,
                      method: 'PATCH',
                      json: { role: m.role === 'viewer' ? 'member' : 'viewer' },
                    })
                  }
                >
                  {m.role === 'viewer' ? p.role.member : p.role.viewer}
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="plain"
                  onClick={() => run.mutate({ path: `/members/${m.id}`, method: 'DELETE' })}
                >
                  {p.remove}
                </GlassButton>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canManage &&
        (project.candidates.length ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-subhead font-medium text-fg">
              {p.addMemberLabel}
              <select
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                className="min-h-touch rounded-control border border-input-border bg-surface-solid px-3 text-fg"
              >
                <option value="">—</option>
                {project.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <GlassButton
              variant="primary"
              disabled={!candidate || run.isPending}
              onClick={() =>
                run.mutate(
                  { path: '/members', method: 'POST', json: { userId: candidate } },
                  { onSuccess: () => setCandidate('') },
                )
              }
            >
              {p.addMember}
            </GlassButton>
          </div>
        ) : (
          <p className="text-footnote text-muted">{p.noCandidates}</p>
        ))}
    </div>
  );
}

/** Project menu: one entry point (a sheet) for settings, members and the rare, heavier actions. */
export function ProjectMenu({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const apply = useProjectMutation(project);
  const [panel, setPanel] = useState<Panel>(null);
  const [transferTo, setTransferTo] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const current: Panel = open ? (panel ?? 'menu') : null;
  const close = () => {
    setPanel(null);
    onOpenChange(false);
  };
  const perms = project.permissions;

  const archive = useMutation({
    mutationFn: () =>
      api<ProjectDetail>(`/api/projects/${project.id}/archive`, {
        method: 'POST',
        json: { archived: !project.archived },
      }),
    onSuccess: (data) => {
      apply(data);
      toast({ title: data.archived ? p.archivedToast : p.restoredToast, tone: 'success' });
      close();
    },
  });
  const transfer = useMutation({
    mutationFn: () =>
      api<ProjectDetail>(`/api/projects/${project.id}/transfer`, {
        method: 'POST',
        json: { userId: transferTo },
      }),
    onSuccess: (data) => {
      apply(data);
      toast({ title: p.transferred, tone: 'success' });
      close();
    },
  });
  const goAway = (title: string) => {
    queryClient.removeQueries({ queryKey: projectKey(project.id) });
    void queryClient.invalidateQueries({ queryKey: projectsKey });
    toast({ title, tone: 'success' });
    close();
    router.replace('/progetti');
  };
  const leave = useMutation({
    mutationFn: () => api(`/api/projects/${project.id}/leave`, { method: 'POST' }),
    onSuccess: () => goAway(p.left),
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/projects/${project.id}`, { method: 'DELETE', json: { confirmName } }),
    onSuccess: () => goAway(p.deleted),
  });

  const entry = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`k-pressable flex min-h-touch w-full items-center gap-3 rounded-control px-2 text-left text-body ${danger ? 'text-danger' : 'text-fg'} hover:bg-neutral-soft`}
      >
        <span aria-hidden="true">{icon}</span>
        {label}
      </button>
    </li>
  );

  const titles: Record<Exclude<Panel, null>, string> = {
    menu: project.name,
    settings: p.settings,
    members: p.members,
    transfer: p.transfer,
    leave: p.leave,
    delete: p.delete,
  };

  return (
    <Sheet
      open={current !== null}
      onOpenChange={(o) => !o && close()}
      title={current ? titles[current] : ''}
      description={current === 'menu' ? p.menu : undefined}
    >
      {current === 'menu' && (
        <ul className="flex flex-col gap-1">
          {perms['project:settings'] &&
            entry(<Settings2 className="size-5" />, p.settings, () => setPanel('settings'))}
          {entry(<Users className="size-5" />, p.members, () => setPanel('members'))}
          {perms['project:transfer'] &&
            entry(<UserCog className="size-5" />, p.transfer, () => setPanel('transfer'))}
          {perms['project:archive'] &&
            entry(
              project.archived ? (
                <ArchiveRestore className="size-5" />
              ) : (
                <Archive className="size-5" />
              ),
              project.archived ? p.restore : p.archive,
              () => archive.mutate(),
            )}
          {perms['project:leave'] &&
            entry(<LogOut className="size-5" />, p.leave, () => setPanel('leave'), true)}
          {perms['project:delete'] &&
            entry(<Trash2 className="size-5" />, p.delete, () => setPanel('delete'), true)}
        </ul>
      )}
      {current === 'settings' && <SettingsForm project={project} onDone={close} />}
      {current === 'members' && <Members project={project} />}
      {current === 'transfer' && (
        <div className="flex flex-col gap-4">
          <p className="text-subhead text-muted">{p.transferHelp}</p>
          <RadioCards
            label={p.transfer}
            value={transferTo}
            onChange={setTransferTo}
            options={project.members
              .filter((m) => m.role !== 'owner')
              .map((m) => ({ value: m.id, label: m.name }))}
          />
          <FormError message={transfer.error ? message(transfer.error) : null} />
          <GlassButton
            variant="primary"
            disabled={!transferTo || transfer.isPending}
            onClick={() => transfer.mutate()}
            className="self-start"
          >
            {p.transfer}
          </GlassButton>
        </div>
      )}
      {current === 'leave' && (
        <div className="flex flex-col gap-4">
          <p className="text-body text-fg">{p.leaveConfirm}</p>
          <div className="flex gap-2">
            <GlassButton variant="plain" onClick={() => setPanel('menu')}>
              {it.common.cancel}
            </GlassButton>
            <GlassButton variant="danger" onClick={() => leave.mutate()} disabled={leave.isPending}>
              {p.leave}
            </GlassButton>
          </div>
        </div>
      )}
      {current === 'delete' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <p className="text-subhead text-muted">{p.deleteHelp}</p>
          <GlassInput
            label={p.deleteConfirmLabel(project.name)}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
          />
          <FormError message={remove.error ? message(remove.error) : null} />
          <GlassButton
            type="submit"
            variant="danger"
            disabled={confirmName.trim() !== project.name || remove.isPending}
            className="self-start"
          >
            {p.delete}
          </GlassButton>
        </form>
      )}
    </Sheet>
  );
}
