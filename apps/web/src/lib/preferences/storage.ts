export const PREFERENCES_KEY = 'kyon.prefs';
export const LITE_DETECTED_KEY = 'kyon.lite-detected';

/** localStorage can throw (private mode, blocked storage): never let that break the UI. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('localStorage read failed', error);
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('localStorage write failed', error);
  }
}
