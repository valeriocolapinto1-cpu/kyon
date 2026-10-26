import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectsView } from '@/components/feature/ProjectsView';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.projects.title };

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsView />
    </Suspense>
  );
}
