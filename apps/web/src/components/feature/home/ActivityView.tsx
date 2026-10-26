'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ActivityLine } from '@/components/feature/home/ActivityLine';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useActivity } from '@/lib/client/home';
import { it } from '@/lib/i18n/it';

const a = it.activity;

/** The group's history across the projects you're in, filterable by project. */
export function ActivityView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = params.get('project');
  const activity = useActivity(projectId);
  const pages = activity.data?.pages ?? [];
  const events = pages.flatMap((page) => page.events);
  const projects = pages[0]?.projects ?? [];

  return (
    <>
      <PageHeader title={a.title} subtitle={a.subtitle} />
      <div className="mb-4 max-w-xs">
        <GlassSelect
          label={a.filter}
          value={projectId ?? ''}
          onChange={(event) =>
            router.replace(
              event.target.value
                ? `${pathname}?project=${encodeURIComponent(event.target.value)}`
                : pathname,
              { scroll: false },
            )
          }
          options={[
            { value: '', label: a.allProjects },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </div>
      {activity.isError ? (
        <EmptyState title={it.common.errorTitle} body={activity.error.message} />
      ) : !activity.data ? (
        <SkeletonList rows={5} />
      ) : events.length === 0 ? (
        <EmptyState title={a.empty} body={it.home.subtitle} />
      ) : (
        <GlassCard className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4">
            {events.map((e) => (
              <ActivityLine key={e.id} event={e} showProject={!projectId} />
            ))}
          </ol>
          {activity.hasNextPage && (
            <GlassButton
              variant="glass"
              size="sm"
              className="self-center"
              disabled={activity.isFetchingNextPage}
              onClick={() => void activity.fetchNextPage()}
            >
              {a.more}
            </GlassButton>
          )}
        </GlassCard>
      )}
    </>
  );
}
