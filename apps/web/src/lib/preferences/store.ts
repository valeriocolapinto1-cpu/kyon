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
    return sanitizePreferences(JSON.parse(raw));
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
    const next = sanitizePreferences({ ...preferencesStore.get(), ...patch });
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
  return {
    prefersDark: match(QUERIES.prefersDark),
    prefersContrastMore: match(QUERIES.prefersContrastMore),
    prefersReducedMotion: match(QUERIES.prefersReducedMotion),
    prefersReducedTransparency: match(QUERIES.prefersReducedTransparency),
    liteDetected,
  };
}

function refreshEnvironment() {
  envSnapshot = readEnvironment();
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
