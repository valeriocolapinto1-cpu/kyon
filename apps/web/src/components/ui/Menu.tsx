'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
    }
  | { type: 'sub'; label: string; icon?: ReactNode; entries: MenuEntry[]; disabled?: boolean }
  | {
      type: 'radio';
      label: string;
      value: string;
      options: { value: string; label: string }[];
      onChange: (value: string) => void;
    }
  | { type: 'separator' };

const itemClass =
  'flex min-h-touch cursor-default items-center gap-3 rounded-control px-3 text-body text-fg outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent-soft';
const contentClass = 'k-chrome z-50 min-w-56 rounded-card p-1.5 outline-none';

function Entries({ entries }: { entries: MenuEntry[] }) {
  return entries.map((entry, index) => {
    if (entry.type === 'separator')
      return <DropdownMenu.Separator key={index} className="my-1 h-px bg-separator" />;
    if (entry.type === 'sub')
      return (
        <DropdownMenu.Sub key={index}>
          <DropdownMenu.SubTrigger className={itemClass} disabled={entry.disabled}>
            {entry.icon && <span aria-hidden="true">{entry.icon}</span>}
            <span className="flex-1">{entry.label}</span>
            <ChevronRight className="size-4 text-muted" aria-hidden="true" />
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent className={contentClass} sideOffset={4} collisionPadding={12}>
              <Entries entries={entry.entries} />
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      );
    if (entry.type === 'radio')
      return (
        <DropdownMenu.Group key={index} aria-label={entry.label}>
          <DropdownMenu.Label className="px-3 pt-2 pb-1 text-footnote font-semibold text-muted">
            {entry.label}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={entry.value} onValueChange={entry.onChange}>
            {entry.options.map((option) => (
              <DropdownMenu.RadioItem key={option.value} value={option.value} className={itemClass}>
                <span className="flex size-4 items-center justify-center" aria-hidden="true">
                  <DropdownMenu.ItemIndicator>
                    <Check className="size-4" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {option.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Group>
      );
    return (
      <DropdownMenu.Item
        key={index}
        className={cn(itemClass, entry.danger && 'text-danger')}
        disabled={entry.disabled}
        onSelect={entry.onSelect}
      >
        {entry.icon && <span aria-hidden="true">{entry.icon}</span>}
        {entry.label}
      </DropdownMenu.Item>
    );
  });
}

/** Accessible dropdown menu (arrow keys, typeahead, submenus, focus returns to the trigger). */
export function Menu({
  trigger,
  entries,
  open,
  onOpenChange,
  align = 'end',
  label,
}: {
  trigger: ReactNode;
  entries: MenuEntry[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'end';
  label?: string;
}) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={contentClass}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
        >
          <Entries entries={entries} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
