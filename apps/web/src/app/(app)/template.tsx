'use client';

import { m } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

let lastPath: string | null = null;

/**
 * Re-mounted on every navigation: plays the page transition and, after the first page,
 * moves focus to the new page title so screen readers announce where you are.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    // Compare paths (not a boolean) so React Strict Mode's double effect doesn't steal focus.
    let frame = 0;
    if (lastPath !== null && lastPath !== pathname) {
      // The title may render a few frames later (Suspense, data): wait for it, up to ~1 s.
      let tries = 0;
      const focusTitle = () => {
        const title = document.querySelector<HTMLElement>('main h1');
        if (title) title.focus({ preventScroll: true });
        else if (tries++ < 60) frame = requestAnimationFrame(focusTitle);
      };
      focusTitle();
    }
    lastPath = pathname;
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      {children}
    </m.div>
  );
}
