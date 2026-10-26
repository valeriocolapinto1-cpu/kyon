import type { ReactNode } from 'react';

/** Page title. Focusable (tabIndex -1) so navigation can move focus to it. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 tabIndex={-1} className="text-large font-bold tracking-tight text-fg outline-none">
          {title}
        </h1>
        {subtitle && <p className="text-subhead text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
