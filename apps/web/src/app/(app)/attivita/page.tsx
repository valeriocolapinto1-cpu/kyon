import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivityView } from '@/components/feature/home/ActivityView';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.activity.title };

export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityView />
    </Suspense>
  );
}
