import type { Metadata } from 'next';
import { JoinForm } from '@/components/auth/JoinForm';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.auth.createAccount, robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinForm code={decodeURIComponent(code)} />;
}
