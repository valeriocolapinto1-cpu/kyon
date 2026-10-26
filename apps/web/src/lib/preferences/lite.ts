import { LITE_DETECTED_KEY, readStorage, writeStorage } from './storage';

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * Decides once per device whether the glass should run in Lite mode.
 * Signals: very few cores or little memory, or more than 25% of frames dropped
 * while the page is idle for ~1.5 s. The verdict is cached in localStorage.
 */
export function detectLite(onResult: (detected: boolean, reason: string) => void): () => void {
  const cached = readStorage(LITE_DETECTED_KEY);
  if (cached === '1' || cached === '0') {
    onResult(cached === '1', 'cached');
    return () => {};
  }

  const nav = navigator as NavigatorWithMemory;
  if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2) {
    writeStorage(LITE_DETECTED_KEY, '1');
    onResult(true, 'hardware');
    return () => {};
  }

  let frames = 0;
  let slow = 0;
  let last = 0;
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    if (last > 0) {
      frames++;
      if (now - last > 34) slow++; // missed at least one 60 Hz frame
    }
    last = now;
    if (now - start < 1500) {
      raf = requestAnimationFrame(tick);
      return;
    }
    // Hidden tabs throttle rAF: no verdict in that case, try again next visit.
    if (document.visibilityState !== 'visible' || frames < 30) return;
    const detected = slow / frames > 0.25;
    writeStorage(LITE_DETECTED_KEY, detected ? '1' : '0');
    onResult(detected, 'frames');
  };
  const timer = window.setTimeout(() => {
    raf = requestAnimationFrame(tick);
  }, 1000);
  return () => {
    window.clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}
