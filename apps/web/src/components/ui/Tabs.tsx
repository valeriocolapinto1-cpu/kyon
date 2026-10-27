'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { SlidingPill } from './SlidingPill';

interface TabsProps<T extends string> {
  label: string;
  value: T;
  tabs: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** id prefix used to link tabs and panels (aria-controls). */
  idPrefix: string;
}

/** WAI-ARIA tabs (arrow keys, Home/End), pill-styled. Pair with <TabPanel>. */
export function Tabs<T extends string>({ label, value, tabs, onChange, idPrefix }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) onChange(tab.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative inline-flex rounded-pill bg-accent-soft p-1"
    >
      <SlidingPill
        index={tabs.findIndex((t) => t.value === value)}
        count={tabs.length}
        className="bg-surface-solid shadow-sm"
      />
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative min-h-touch flex-1 rounded-pill px-5 text-subhead font-semibold',
              selected ? 'text-fg' : 'text-muted',
            )}
          >
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  value,
  children,
}: {
  idPrefix: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      tabIndex={0}
      className="outline-none"
    >
      {children}
    </div>
  );
}
