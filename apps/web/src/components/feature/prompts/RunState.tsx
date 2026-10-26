import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Loader2,
  Undo2,
} from 'lucide-react';
import type { RunState } from '@kyon/core';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

const icon: Record<RunState, { Icon: typeof CircleCheck; tone: string; spin?: boolean }> = {
  copied: { Icon: CircleDashed, tone: 'text-muted' },
  pr_open: { Icon: GitPullRequest, tone: 'text-accent-text' },
  ci_running: { Icon: Loader2, tone: 'text-warning', spin: true },
  ci_failed: { Icon: CircleX, tone: 'text-danger' },
  ci_passed: { Icon: CircleCheck, tone: 'text-success' },
  merged: { Icon: GitMerge, tone: 'text-success' },
  closed: { Icon: GitPullRequestClosed, tone: 'text-danger' },
  abandoned: { Icon: Undo2, tone: 'text-muted' },
};

/** Run state as icon + text (or icon + hidden text when compact): never colour alone. */
export function RunStateBadge({
  state,
  prNumber,
  compact = false,
}: {
  state: RunState;
  prNumber?: number | null;
  compact?: boolean;
}) {
  const { Icon, tone, spin } = icon[state] ?? { Icon: CircleAlert, tone: 'text-muted' };
  const label = `${it.runs.state[state] ?? state}${prNumber ? ` · ${it.runs.pr(prNumber)}` : ''}`;
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption font-semibold', tone)}>
      <Icon
        className={cn('size-3.5', spin && 'motion-safe:animate-spin')}
        aria-hidden="true"
        strokeWidth={2.5}
      />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
      {compact && prNumber && <span aria-hidden="true">#{prNumber}</span>}
    </span>
  );
}
