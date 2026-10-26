import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PeopleView } from '@/components/feature/home/PeopleView';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.people.title };

export default function PeoplePage() {
  return (
    <Suspense>
      <PeopleView />
    </Suspense>
  );
}
