import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPage } from '@/components/auth/ResetForm';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.auth.resetTitle, robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <ResetPage />
    </Suspense>
  );
}
