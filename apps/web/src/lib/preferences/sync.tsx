'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api } from '@/lib/client/api';
import type { Me } from '@/lib/client/me';
import { preferencesStore } from './store';

const serverRevision = () => 0;

/**
 * Keeps preferences in sync with the account: at login the account copy wins (same look on
 * every device); explicit changes made in Settings are saved back after a short pause.
 */
export function PreferencesSync({ me }: { me: Me }) {
  const applied = useRef(false);
  const revision = useSyncExternalStore(
    preferencesStore.subscribeRevision,
    preferencesStore.revision,
    serverRevision,
  );

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (me.preferences) preferencesStore.apply(me.preferences);
  }, [me.preferences]);

  useEffect(() => {
    if (revision === 0) return;
    const timer = window.setTimeout(() => {
      api('/api/me', { method: 'PATCH', json: { preferences: preferencesStore.get() } }).catch(
        (error: unknown) => console.warn('Preferences sync failed', error),
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [revision]);

  return null;
}
