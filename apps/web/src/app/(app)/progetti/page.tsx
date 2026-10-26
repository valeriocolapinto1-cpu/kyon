import type { Metadata } from 'next';
import { FolderKanban } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { SplitView } from '@/components/ui/SplitView';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.projects.title };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title={it.projects.title} />
      <SplitView
        list={
          <EmptyState
            icon={<FolderKanban className="size-10" />}
            title={it.projects.emptyTitle}
            body={it.projects.emptyBody}
          />
        }
        detail={
          <GlassCard className="flex min-h-64 items-center justify-center text-center">
            <p className="text-body text-muted">{it.projects.selectHint}</p>
          </GlassCard>
        }
      />
    </>
  );
}
