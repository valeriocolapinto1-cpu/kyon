import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { DevGallery } from '@/components/feature/DevGallery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design system', robots: { index: false } };

/** Component gallery, development only (hidden when KYON_ENV is "production"). */
export default async function DevUiPage() {
  const { env } = await getCloudflareContext({ async: true });
  if (env.KYON_ENV === 'production') notFound();
  return <DevGallery />;
}
