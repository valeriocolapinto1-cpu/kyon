'use client';

import { Sheet } from '@/components/ui/Sheet';
import { it } from '@/lib/i18n/it';

const s = it.shortcuts;

/** The keyboard shortcuts ("?" anywhere outside text fields, wired in the app shell). */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
