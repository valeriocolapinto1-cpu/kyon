'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Renders its children later, so a long page doesn't hydrate in one long task:
 * - `when="idle"`: right after the first paint, when the browser is idle (`order` staggers);
 * - `when="interaction"`: on the first sign that the person is using the page (touch, key,
 *   scroll, wheel), when the placeholder gets near the screen, or after `delay` ms at the
 *   latest; then idle and staggered like `idle`. For sections below the fold: the first
 *   screen becomes interactive without paying for what nobody has looked at yet. A key press
 *   mounts everything, so Tab never skips a section.
 * With a #hash in the URL, or when it changes (in-page links), everything renders at once.
 * The fallback should carry the section's real heading, so the outline stays navigable.
 */
export function Deferred({
  children,
  fallback = null,
  order = 0,
  when = 'idle',
  delay = 8000,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  order?: number;
  when?: 'idle' | 'interaction';
  delay?: number;
}) {
  const [ready, setReady] = useState(false);
  const placeholder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ready) return;
    const w = window as IdleWindow;
    let idle = 0;
    let timer = 0;
    let fallbackTimer = 0;
    let observer: IntersectionObserver | null = null;
    let scheduled = false;
    const show = () => setReady(true);
    const showSoon = () => {
      if (scheduled) return;
      scheduled = true;
      stopWatching();
      if (w.requestIdleCallback) {
        timer = w.setTimeout(() => {
          idle = w.requestIdleCallback?.(show, { timeout: 1500 }) ?? 0;
        }, order * 50);
      } else {
        timer = w.setTimeout(show, 100 + order * 80);
      }
    };
    const stopWatching = () => {
      for (const type of INPUT_EVENTS) w.removeEventListener(type, showSoon, true);
      observer?.disconnect();
      w.clearTimeout(fallbackTimer);
    };
    w.addEventListener('hashchange', show);
    if (w.location.hash) {
      timer = w.setTimeout(show, 0);
    } else if (when === 'interaction') {
      for (const type of INPUT_EVENTS)
        w.addEventListener(type, showSoon, { capture: true, passive: true });
      if ('IntersectionObserver' in w && placeholder.current) {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((e) => e.isIntersecting)) showSoon();
          },
          { rootMargin: '200px 0px' },
        );
        observer.observe(placeholder.current);
      }
      fallbackTimer = w.setTimeout(showSoon, delay);
    } else {
      showSoon();
    }
    return () => {
      w.removeEventListener('hashchange', show);
      stopWatching();
      w.clearTimeout(timer);
      if (idle) w.cancelIdleCallback?.(idle);
    };
  }, [order, when, delay, ready]);
  if (ready) return children;
  return <div ref={placeholder}>{fallback}</div>;
}

/** Placeholder of a lazily rendered settings-like section: its real heading and a skeleton. */
export function SectionPlaceholder({ id, title }: { id: string; title: string }) {
  return (
    <section aria-labelledby={id} className="k-glass flex flex-col gap-3 rounded-card p-4">
      <h2 id={id} className="text-title3 font-semibold text-fg">
        {title}
      </h2>
      <div aria-hidden="true" className="k-skeleton h-16 rounded-control" />
    </section>
  );
}
