import type { Metadata } from 'next';
import { ResetForm } from '@/components/auth/ResetForm';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.auth.resetTitle, robots: { index: false } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetForm token={token} />;
}
