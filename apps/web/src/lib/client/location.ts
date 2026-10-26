'use client';

import { safeResumePath } from '@kyon/core';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { api } from './api';

const KEY = 'kyon:last-location';

export interface SavedLocation {
  path: string;
  title: string;
  at: string | null;
}

export function readLocalLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedLocation>;
    const path = safeResumePath(parsed.path);
    return path ? { path, title: String(parsed.title ?? ''), at: parsed.at ?? null } : null;
  } catch (error) {
    console.warn('Cannot read the last location', error);
    return null;
  }
}

/**
 * "Ritorna dove hai lasciato": remembers the page (with tab, task, room…) after a pause on it,
 * on this device and in the account. Navigation only, never scrolling. Home itself isn't saved.
 */
export function useLocationTracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  useEffect(() => {
    const path = safeResumePath(`${pathname}${search ? `?${search}` : ''}`);
    if (!path || pathname === '/') return;
    const timer = setTimeout(() => {
      // A page can name its content better than its h1 (a project's name, not "Progetti").
      const heading =
        document.querySelector('main [data-resume-title]') ?? document.querySelector('main h1');
      const title = (heading?.textContent ?? '').trim().slice(0, 120);
      const saved: SavedLocation = { path, title, at: new Date().toISOString() };
      try {
        localStorage.setItem(KEY, JSON.stringify(saved));
      } catch (error) {
        console.warn('Cannot save the last location', error);
      }
      api('/api/me/location', { method: 'PUT', json: { path, title } }).catch((error: unknown) =>
        console.warn('Cannot sync the last location', error),
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [pathname, search]);
}

export function LocationTracker() {
  useLocationTracker();
  return null;
}
