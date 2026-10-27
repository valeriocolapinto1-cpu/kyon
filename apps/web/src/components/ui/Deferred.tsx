'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Renders its children later, so a long page doesn't hydrate in one long task:
 * - `when="idle"`: right after the first paint, when the browser is idle (`order` staggers);
 * - `when="visible"`: when the placeholder gets near the screen (sections below the fold).
 * With a #hash in the URL, or when it changes (in-page links), everything renders at once.
 * The fallback should carry the section's real heading, so the outline stays navigable.
 */
export function Deferred({
  children,
  fallback = null,
  order = 0,
  when = 'idle',
}: {
  children: ReactNode;
  fallback?: ReactNode;
  order?: number;
  when?: 'idle' | 'visible';
}) {
  const [ready, setReady] = useState(false);
  const placeholder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ready) return;
    const w = window as IdleWindow;
    let idle = 0;
    let timer = 0;
    let observer: IntersectionObserver | null = null;
    const show = () => setReady(true);
    w.addEventListener('hashchange', show);
    if (w.location.hash) {
      timer = w.setTimeout(show, 0);
    } else if (when === 'visible' && 'IntersectionObserver' in w && placeholder.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) show();
        },
        { rootMargin: '400px 0px' },
      );
      observer.observe(placeholder.current);
    } else if (w.requestIdleCallback) {
      timer = w.setTimeout(() => {
        idle = w.requestIdleCallback?.(show, { timeout: 1500 }) ?? 0;
      }, order * 50);
    } else {
      timer = w.setTimeout(show, 100 + order * 80);
    }
    return () => {
      w.removeEventListener('hashchange', show);
      w.clearTimeout(timer);
      if (idle) w.cancelIdleCallback?.(idle);
      observer?.disconnect();
    };
  }, [order, when, ready]);
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
