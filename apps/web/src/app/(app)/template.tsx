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
    if (lastPath !== null && lastPath !== pathname) {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    }
    lastPath = pathname;
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
