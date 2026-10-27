'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** The service worker: offline read-only data and Web Push (production builds only). */
export function registerServiceWorker(onUpdate: () => void) {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch((error: unknown) => console.warn('Service worker not registered', error));
  // A new version took over: say so once (not on the very first install).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate();
  });
}

/** Forgets the data saved for offline use (at logout: the next person sees nothing of it). */
export async function clearOfflineData() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  reg?.active?.postMessage({ type: 'clear' });
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('kyon-data') || k.startsWith('kyon-pages'))
        .map((k) => caches.delete(k)),
    );
  }
}

const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

/** true when the browser says there's no network (server render: assume online). */
export function useOffline() {
  return useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
}

// ---------- Install ----------

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Chrome/Edge: keep it for our own "Installa" button.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    for (const l of listeners) l();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const l of listeners) l();
  });
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'manual';

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** How Kyon can be installed here: native prompt (Chrome/Edge), iOS guide, or by hand. */
export function useInstall() {
  const [state, setState] = useState<InstallState | null>(null);
  useEffect(() => {
    const update = () =>
      setState(isStandalone() ? 'installed' : deferred ? 'prompt' : isIos() ? 'ios' : 'manual');
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    for (const l of listeners) l();
    return outcome === 'accepted';
  };
  return { state, install };
}

const USE_DAYS_KEY = 'kyon.use-days';
const INSTALL_HINT_KEY = 'kyon.install-hint';

/**
 * The discreet "Installa Kyon" reminder: after 3 different days of use, not installed, never
 * dismissed. Stored on this device only.
 */
export function useInstallReminder() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (isStandalone() || localStorage.getItem(INSTALL_HINT_KEY) === 'off') return;
      const today = new Date().toISOString().slice(0, 10);
      const days = new Set<string>(JSON.parse(localStorage.getItem(USE_DAYS_KEY) ?? '[]'));
      days.add(today);
      localStorage.setItem(USE_DAYS_KEY, JSON.stringify([...days].slice(-10)));
      const timer = window.setTimeout(() => setShow(days.size >= 3), 0);
      return () => window.clearTimeout(timer);
    } catch (error) {
      console.warn('Install reminder unavailable', error);
    }
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(INSTALL_HINT_KEY, 'off');
    } catch (error) {
      console.warn('Install reminder not saved', error);
    }
  };
  return { show, dismiss };
}
