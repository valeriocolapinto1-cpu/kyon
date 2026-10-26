'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { m } from 'motion/react';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';
import { NAV_ITEMS, isActive } from './nav';

/** Floating pill tab bar at the bottom (phones in portrait). */
export function TabBarPill() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={it.nav.label}
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,var(--k-safe-bottom))] md:hidden phone-landscape:hidden"
    >
      <ul className="k-chrome flex w-full max-w-md items-stretch justify-between rounded-pill p-1.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                data-plain
                className={cn(
                  'k-pressable relative flex min-h-touch flex-col items-center justify-center gap-0.5 rounded-pill px-2 py-1.5',
                  active ? 'text-accent-text' : 'text-fg',
                )}
              >
                {active && (
                  <m.span
                    layoutId="tabbar-active"
                    className="absolute inset-0 rounded-pill bg-accent-soft"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  />
                )}
                <Icon
                  className="relative size-6"
                  strokeWidth={active ? 2.6 : 1.8}
                  aria-hidden="true"
                />
                <span className={cn('relative text-caption', active ? 'font-bold' : 'font-medium')}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
