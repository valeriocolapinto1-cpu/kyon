'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { GlassButton } from '@/components/ui/GlassButton';
import { Sheet } from '@/components/ui/Sheet';
import { markRead, notificationsKey, useNotifications } from '@/lib/client/notifications';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const t = it.notifications;

/** The notification center (loaded the first time the bell is opened). */
export default function NotificationPanel({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const center = useNotifications();
  const router = useRouter();
  const queryClient = useQueryClient();
  const unread = center.data?.unread ?? 0;
  const items = center.data?.notifications ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationsKey });

  const openItem = async (id: string, url: string, read: boolean) => {
    setOpen(false);
    router.push(url);
    if (!read) {
      await markRead([id]);
      void refresh();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={t.title}
      footer={
        unread > 0 ? (
          <GlassButton
            size="sm"
            variant="plain"
            onClick={async () => {
              await markRead('all');
              void refresh();
            }}
          >
            {t.markAll}
          </GlassButton>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-body text-muted">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void openItem(n.id, n.url, n.read)}
                className={cn(
                  'flex w-full gap-3 rounded-control px-3 py-2 text-left hover:bg-neutral-soft',
                  !n.read && 'bg-accent-soft',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-2 size-2 shrink-0 rounded-full',
                    n.read ? 'bg-transparent' : 'bg-accent-fill',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-subhead font-semibold text-fg">
                    {!n.read && <span className="sr-only">{t.unread}: </span>}
                    {n.title}
                  </span>
                  <span className="line-clamp-2 block text-footnote text-fg">{n.body}</span>
                  <span className="block text-caption text-muted">
                    <time dateTime={n.updatedAt}>{relativeTime(n.updatedAt)}</time>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
