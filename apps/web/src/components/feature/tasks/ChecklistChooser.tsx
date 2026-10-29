'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { projectKey } from '@/lib/client/projects';
import { markdownFilesKey, tasksKey, useMarkdownFiles, type TasksData } from '@/lib/client/tasks';
import { it } from '@/lib/i18n/it';

const c = it.tasks.checklist;

/**
 * Picks which .md files of the repo are checklists. Saving stores the choice, then reads exactly
 * those files; un-chosen ones disappear from the board without losing their tasks' metadata.
 */
export function ChecklistChooser({
  projectId,
  canManage,
  onSaved,
}: {
  projectId: string;
  canManage: boolean;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const files = useMarkdownFiles(projectId, true);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (files.isPending) return <SkeletonList rows={4} />;
  if (files.isError || !files.data)
    return <FormError message={files.error?.message ?? c.loadError} />;

  const saved = files.data.selected ?? [];
  const current = picked ?? saved;
  const changed =
    files.data.selected === null ||
    current.length !== saved.length ||
    current.some((path) => !saved.includes(path));

  const toggle = (path: string, on: boolean) =>
    setPicked(on ? [...new Set([...current, path])] : current.filter((x) => x !== path));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}`, {
        method: 'PATCH',
        json: { checklistFiles: current },
      });
      const next = await api<TasksData>(`/api/projects/${projectId}/sync`, { method: 'POST' });
      queryClient.setQueryData(tasksKey(projectId), next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: markdownFilesKey(projectId) }),
      ]);
      setPicked(null);
      toast({ tone: 'success', title: c.saved });
      onSaved?.();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!canManage && <p className="text-subhead text-muted">{c.ownerOnly}</p>}
      {files.data.files.length === 0 ? (
        <p className="text-body text-muted">{c.none}</p>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-footnote font-semibold text-muted">{c.legend}</legend>
          {files.data.files.map((file) => (
            <Checkbox
              key={file.path}
              label={[
                file.path,
                file.tasks ? c.count(file.tasks) : null,
                file.kind === 'archive' ? c.archive : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              checked={current.includes(file.path)}
              disabled={!canManage || saving}
              onChange={(event) => toggle(file.path, event.target.checked)}
              className="break-all"
            />
          ))}
        </fieldset>
      )}
      {files.data.truncated && <p className="text-footnote text-muted">{c.truncated}</p>}
      <FormError
        message={
          error instanceof ApiClientError ? error.message : error ? it.common.errorBody : null
        }
      />
      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <GlassButton variant="primary" disabled={saving || !changed} onClick={() => void save()}>
            {saving ? c.saving : c.save}
          </GlassButton>
          <span className="text-footnote text-muted" aria-live="polite">
            {c.chosen(current.length)}
          </span>
        </div>
      )}
    </div>
  );
}

export function ChecklistSheet({
  open,
  onOpenChange,
  projectId,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  canManage: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={c.title} description={c.description}>
      {open && (
        <ChecklistChooser
          projectId={projectId}
          canManage={canManage}
          onSaved={() => onOpenChange(false)}
        />
      )}
    </Sheet>
  );
}
