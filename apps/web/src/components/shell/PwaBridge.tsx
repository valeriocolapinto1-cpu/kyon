'use client';

import { WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { registerServiceWorker, useOffline } from '@/lib/client/pwa';
import { it } from '@/lib/i18n/it';

/** Service worker (offline copy, push), "new version" toast and the offline banner. */
export function PwaBridge() {
  const { toast } = useToast();
  const offline = useOffline();
  useEffect(() => {
    const start = () =>
      registerServiceWorker(() =>
        toast({
          title: it.pwa.updated,
          action: { label: it.pwa.reload, onAction: () => window.location.reload() },
        }),
      );
    // After the page is up: installing the worker must not compete with the first paint.
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }, [toast]);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="k-chrome fixed inset-x-4 top-[calc(var(--k-safe-top)+0.5rem)] z-40 mx-auto flex max-w-md items-center gap-2 rounded-pill px-4 py-2 text-footnote font-semibold text-fg"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      {it.pwa.offline}
    </div>
  );
}
