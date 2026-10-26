import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JoinPage } from '@/components/auth/JoinForm';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.auth.createAccount, robots: { index: false } };

// Static page: the invite code travels in the query string (no per-request rendering).
export default function Page() {
  return (
    <Suspense>
      <JoinPage />
    </Suspense>
  );
}
