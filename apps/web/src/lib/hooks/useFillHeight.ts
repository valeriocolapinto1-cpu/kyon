'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Height that makes `ref` fill the screen from its top edge down to the bottom tab bar, or to the
 * keyboard when it's open (iOS: visualViewport shrinks, fixed bars stay behind the keyboard).
 * Null when disabled (e.g. larger screens that use the normal layout).
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const viewport = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const nav = document.querySelector<HTMLElement>('[data-tabbar]');
      const rect = nav?.getBoundingClientRect();
      // Hidden (larger screens, phone landscape): no bar to avoid.
      const navTop = rect && rect.height > 0 ? rect.top : viewport;
      // The tab bar counts only when it's on screen (not behind the keyboard).
      const bottom = Math.min(viewport, navTop < viewport ? navTop : viewport);
      // Measured from the document top: scrolling the page must not change the height (a scroll
      // would resize the pane, which scrolls again…).
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(240, Math.floor(bottom - top - 8)));
    };
    update();
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, enabled]);
  return enabled ? height : null;
}
