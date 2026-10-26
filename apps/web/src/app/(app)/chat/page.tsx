import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChatView } from '@/components/feature/chat/ChatView';
import { it } from '@/lib/i18n/it';

export const metadata: Metadata = { title: it.chat.title };

export default function ChatPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
