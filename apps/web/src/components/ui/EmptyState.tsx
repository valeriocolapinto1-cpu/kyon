import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <GlassCard className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && (
        <span aria-hidden="true" className="text-accent-text">
          {icon}
        </span>
      )}
      <h2 className="text-title3 font-semibold text-fg">{title}</h2>
      <p className="max-w-prose text-body text-muted">{body}</p>
      {action}
    </GlassCard>
  );
}
