'use client';

import { useEffect } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { it } from '@/lib/i18n/it';

const s = it.shortcuts;

function typingInField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** "?" anywhere (outside text fields) lists the keyboard shortcuts. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingInField(event.target) || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={s.title} readingContent>
      <div className="flex flex-col gap-5">
        {s.groups.map((group) => (
          <section key={group.title} aria-labelledby={`shortcuts-${group.title}`}>
            <h3 id={`shortcuts-${group.title}`} className="mb-2 text-headline text-fg">
              {group.title}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              {group.items.map(([keys, what]) => (
                <div key={keys + what} className="contents">
                  <dt>
                    <kbd className="inline-block rounded-control border border-border bg-surface-solid px-2 py-0.5 font-mono text-footnote text-fg">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="text-subhead text-fg">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
