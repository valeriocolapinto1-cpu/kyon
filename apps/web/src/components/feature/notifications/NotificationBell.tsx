'use client';

import { Bell } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useNotifications } from '@/lib/client/notifications';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

const t = it.notifications;
const NotificationPanel = dynamic(() => import('./NotificationPanel'), { ssr: false });

/** The bell (badge with the unread count); the center loads when it's first opened. */
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const unread = useNotifications().data?.unread ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-label={t.bell(unread)}
        className={cn(
          'k-pressable relative flex size-touch items-center justify-center rounded-full text-fg hover:bg-neutral-soft',
          className,
        )}
      >
        <Bell className="size-5" aria-hidden="true" strokeWidth={unread ? 2.4 : 1.8} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger-fill px-1 text-caption font-bold text-on-danger"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {mounted && <NotificationPanel open={open} setOpen={setOpen} />}
    </>
  );
}
