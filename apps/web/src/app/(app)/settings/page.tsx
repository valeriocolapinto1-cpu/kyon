import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsView } from '@/components/feature/SettingsView';
import { PageHeader } from '@/components/ui/PageHeader';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.settings.title };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title={it.settings.title} />
      <Suspense>
        <SettingsView />
      </Suspense>
    </>
  );
}
