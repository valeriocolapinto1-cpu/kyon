'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { it } from '@/lib/i18n/it';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  keywords?: string[];
  href?: string;
  run?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  /** Controlled search text (the parent fetches server results for it). */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Results found by the server: always shown, whatever the local fuzzy match says. */
  remoteItems?: CommandItem[];
  loading?: boolean;
}

/** The palette: jump anywhere or run an action (the shell opens it with Cmd/Ctrl+K). */
export function CommandPalette({
  open,
  onOpenChange,
  items: localItems,
  query,
  onQueryChange,
  remoteItems = [],
  loading = false,
}: CommandPaletteProps) {
  const router = useRouter();

  // Server results carry the query among their keywords, so cmdk's filter keeps them.
  const items = [
    ...localItems,
    ...remoteItems.map((item) => ({ ...item, keywords: [...(item.keywords ?? []), query ?? ''] })),
  ];
  const groups = [...new Set(items.map((item) => item.group))];
  const select = (item: CommandItem) => {
    onOpenChange(false);
    if (item.href) router.push(item.href);
    item.run?.();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={it.commandPalette.title}
      overlayClassName="fixed inset-0 z-40 bg-black/40"
      contentClassName="k-chrome fixed top-[12dvh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-sheet"
    >
      <Command.Input
        value={query}
        onValueChange={onQueryChange}
        placeholder={it.commandPalette.placeholder}
        aria-label={it.commandPalette.placeholder}
        className="min-h-touch w-full border-b border-separator bg-transparent px-5 py-4 text-fg outline-none placeholder:text-muted"
      />
      <Command.List className="max-h-[50dvh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-muted">
          {loading ? it.search.loading : it.commandPalette.empty}
        </Command.Empty>
        {groups.map((group) => (
          <Command.Group
            key={group}
            heading={group}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-footnote [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted"
          >
            {items
              .filter((item) => item.group === group)
              .map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                  onSelect={() => select(item)}
                  className="flex min-h-touch cursor-pointer items-center gap-3 rounded-control px-3 text-fg data-[selected=true]:bg-accent-soft"
                >
                  {item.icon && (
                    <span aria-hidden="true" className="text-accent-text">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
