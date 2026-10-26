import type { Metadata } from 'next';
import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.chat.title };

export default function ChatPage() {
  return (
    <>
      <PageHeader title={it.chat.title} />
      <EmptyState
        icon={<MessagesSquare className="size-10" />}
        title={it.chat.emptyTitle}
        body={it.chat.emptyBody}
      />
    </>
  );
}
