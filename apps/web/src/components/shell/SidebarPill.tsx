'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { m } from 'motion/react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';
import { Logo } from './Logo';
import { NAV_ITEMS, isActive } from './nav';

/** Floating glass sidebar (tablet, desktop and phones in landscape). */
export function SidebarPill({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={it.nav.label}
      className="fixed top-0 bottom-0 left-0 z-30 hidden items-center py-4 pl-[max(1rem,var(--k-safe-left))] md:flex phone-landscape:flex phone-landscape:py-2"
    >
      <div className="k-chrome flex flex-col items-center gap-1 rounded-pill p-1.5">
        <Link
          href="/"
          data-plain
          className="flex size-touch items-center justify-center"
          aria-label={it.app.name}
        >
          <Logo className="size-8" />
        </Link>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  data-plain
                  className={cn(
                    'k-pressable relative flex w-18 flex-col items-center justify-center gap-0.5 rounded-pill py-2 phone-landscape:w-touch phone-landscape:py-1',
                    active ? 'text-accent-text' : 'text-fg',
                  )}
                >
                  {active && (
                    <m.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-pill bg-accent-soft"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    />
                  )}
                  <Icon
                    className="relative size-6"
                    strokeWidth={active ? 2.6 : 1.8}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'relative text-caption phone-landscape:sr-only',
                      active ? 'font-bold' : 'font-medium',
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onSearch}
          aria-label={it.nav.searchHint}
          className="k-pressable flex size-touch items-center justify-center rounded-full text-fg hover:bg-neutral-soft"
        >
          <Search className="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
