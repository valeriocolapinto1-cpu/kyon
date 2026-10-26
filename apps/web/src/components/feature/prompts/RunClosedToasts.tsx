'use client';

import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { useProjectLive } from '@/lib/client/projectLive';
import type { ProjectDetail } from '@/lib/client/projects';
import { it } from '@/lib/i18n/it';
import { plainText } from '@/components/ui/InlineText';

/**
 * When a merge closes a task, the person who launched the run gets a toast with "Annulla
 * chiusura" (the button also stays on the run, for whoever comes later).
 */
export function RunClosedToasts({ project }: { project: ProjectDetail }) {
  const { toast } = useToast();
  const me = useMe().data;
  useProjectLive((event) => {
    if (event.type !== 'runs_changed' || !event.closed || !me) return;
    if (event.closed.launchedBy !== me.id) return;
    const { runId, taskText } = event.closed;
    toast({
      tone: 'success',
      title: it.runs.closedToast(plainText(taskText)),
      durationMs: 12_000,
      action: project.permissions['project:run_prompt']
        ? {
            label: it.runs.undoClose,
            onAction: () =>
              void api(`/api/runs/${runId}/undo-close`, { method: 'POST' }).then(
                () => toast({ tone: 'success', title: it.runs.undone }),
                () => toast({ tone: 'error', title: it.common.errorBody }),
              ),
          }
        : undefined,
    });
  });
  return null;
}
