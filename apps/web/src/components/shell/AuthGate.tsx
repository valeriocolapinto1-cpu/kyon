'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { rotateSession } from '@/lib/client/auth';
import { useMe } from '@/lib/client/me';
import { PreferencesSync } from '@/lib/preferences/sync';

/**
 * Pages are static shells rendered at once (fast first paint); data comes from authenticated
 * APIs and each block shows its own skeleton. Without a session we go to /login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const unauthorized = me.isError && (me.error as { status?: number }).status === 401;

  useEffect(() => {
    if (unauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, router, pathname]);

  useEffect(() => {
    if (!me.data) return;
    try {
      if (sessionStorage.getItem('kyon.rotated')) return;
      sessionStorage.setItem('kyon.rotated', '1');
    } catch {
      // Storage blocked: rotating on every load is harmless.
    }
    rotateSession().catch((error: unknown) => console.warn('Session rotation failed', error));
  }, [me.data]);

  return (
    <>
      {me.data && <PreferencesSync me={me.data} />}
      {children}
    </>
  );
}
