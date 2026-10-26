'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { buildTheme, resolveHtmlAttributes, type Environment, type Preferences } from '@kyon/core';
import { environmentStore, preferencesStore } from './store';

interface PreferencesContextValue {
  preferences: Preferences;
  environment: Environment;
  /** Attributes currently applied to <html>. */
  resolved: Record<string, string>;
  update: (patch: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function applyToDocument() {
  // Always read the live snapshots: during hydration React renders with server defaults,
  // and we must not overwrite what the boot script already applied.
  const preferences = preferencesStore.get();
  const attrs = resolveHtmlAttributes(preferences, environmentStore.get());
  const root = document.documentElement;
  for (const [name, value] of Object.entries(attrs)) root.setAttribute(name, value);
  const scale = attrs['data-text-scale'];
  if (scale) {
    root.style.setProperty('--k-text-scale', scale);
  } else {
    root.removeAttribute('data-text-scale');
    root.style.removeProperty('--k-text-scale');
  }
  // Browser chrome (status bar, PWA title bar) follows the page background.
  const scheme = attrs['data-scheme'] === 'dark' ? 'dark' : 'light';
  const contrast = attrs['data-contrast'] === 'high' ? 'high' : 'normal';
  const color = buildTheme({ accent: preferences.accent, scheme, contrast }).tokens['bg'];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (color) meta.content = color;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const preferences = useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.get,
    preferencesStore.getServer,
  );
  const environment = useSyncExternalStore(
    environmentStore.subscribe,
    environmentStore.get,
    environmentStore.getServer,
  );
  const resolved = useMemo(
    () => resolveHtmlAttributes(preferences, environment),
    [preferences, environment],
  );

  useEffect(() => {
    applyToDocument();
  }, [resolved]);

  const value = useMemo(
    () => ({ preferences, environment, resolved, update: preferencesStore.set }),
    [preferences, environment, resolved],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}

/** True when animations should be skipped (setting or system). */
export function useReducedMotion(): boolean {
  return usePreferences().resolved['data-reduce-motion'] === 'on';
}
