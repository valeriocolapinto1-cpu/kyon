import {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type Environment,
  type Preferences,
} from '@kyon/core';
import { detectLite } from './lite';
import { PREFERENCES_KEY, readStorage, writeStorage } from './storage';

/**
 * Two tiny external stores (preferences in localStorage, browser environment) read through
 * useSyncExternalStore. Snapshots are cached so React sees stable references.
 */

type Listener = () => void;

/**
 * Equal values keep the same reference: every new snapshot re-renders all the consumers
 * synchronously (useSyncExternalStore), and right after hydration a snapshot that differs
 * from the server one only by reference costs a whole extra render.
 */
function stable<T>(next: T, ...candidates: (T | null)[]): T {
  const json = JSON.stringify(next);
  return candidates.find((c) => c !== null && JSON.stringify(c) === json) ?? next;
}

// ---------- Preferences ----------

const prefListeners = new Set<Listener>();
let prefSnapshot: Preferences | null = null;
/** Bumped only by explicit user changes (Settings), so sync never echoes server or test values. */
let userRevision = 0;
const revisionListeners = new Set<Listener>();

function readStoredPreferences(): Preferences {
  const raw = readStorage(PREFERENCES_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    return stable(sanitizePreferences(JSON.parse(raw)), DEFAULT_PREFERENCES);
  } catch (error) {
    console.warn('Invalid stored preferences, using defaults', error);
    return DEFAULT_PREFERENCES;
  }
}

export const preferencesStore = {
  subscribe(listener: Listener) {
    prefListeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY) {
        prefSnapshot = readStoredPreferences();
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      prefListeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
  get(): Preferences {
    prefSnapshot ??= readStoredPreferences();
    return prefSnapshot;
  },
  getServer(): Preferences {
    return DEFAULT_PREFERENCES;
  },
  /** A change made by the user (saved locally and later synced to the account). */
  set(patch: Partial<Preferences>) {
    preferencesStore.apply(patch);
    userRevision++;
    for (const listener of revisionListeners) listener();
  },
  /** Applies values without counting as a user change (e.g. preferences loaded from the account). */
  apply(patch: Partial<Preferences>) {
    const current = preferencesStore.get();
    const next = stable(
      sanitizePreferences({ ...current, ...patch }),
      current,
      DEFAULT_PREFERENCES,
    );
    if (next === current) return;
    prefSnapshot = next;
    writeStorage(PREFERENCES_KEY, JSON.stringify(next));
    for (const listener of prefListeners) listener();
  },
  subscribeRevision(listener: Listener) {
    revisionListeners.add(listener);
    return () => revisionListeners.delete(listener);
  },
  revision: () => userRevision,
};

// ---------- Environment ----------

const QUERIES = {
  prefersDark: '(prefers-color-scheme: dark)',
  prefersContrastMore: '(prefers-contrast: more)',
  prefersReducedMotion: '(prefers-reduced-motion: reduce)',
  prefersReducedTransparency: '(prefers-reduced-transparency: reduce)',
} as const;

const SERVER_ENV: Environment = {
  prefersDark: false,
  prefersContrastMore: false,
  prefersReducedMotion: false,
  prefersReducedTransparency: false,
  liteDetected: false,
};

let envSnapshot: Environment | null = null;
let liteDetected = false;
let liteStarted = false;
const envListeners = new Set<Listener>();

function readEnvironment(): Environment {
  const match = (q: string) => window.matchMedia(q).matches;
  return stable(
    {
      prefersDark: match(QUERIES.prefersDark),
      prefersContrastMore: match(QUERIES.prefersContrastMore),
      prefersReducedMotion: match(QUERIES.prefersReducedMotion),
      prefersReducedTransparency: match(QUERIES.prefersReducedTransparency),
      liteDetected,
    },
    envSnapshot,
    SERVER_ENV,
  );
}

function refreshEnvironment() {
  const next = readEnvironment();
  if (next === envSnapshot) return;
  envSnapshot = next;
  for (const listener of envListeners) listener();
}

export const environmentStore = {
  subscribe(listener: Listener) {
    envListeners.add(listener);
    const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
    for (const list of lists) list.addEventListener('change', refreshEnvironment);
    if (!liteStarted) {
      liteStarted = true;
      detectLite((detected) => {
        liteDetected = detected;
        refreshEnvironment();
      });
    }
    return () => {
      envListeners.delete(listener);
      for (const list of lists) list.removeEventListener('change', refreshEnvironment);
    };
  },
  get(): Environment {
    envSnapshot ??= readEnvironment();
    return envSnapshot;
  },
  getServer(): Environment {
    return SERVER_ENV;
  },
};
