'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { moveHomeBlock } from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { Sheet } from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { useHomeLayout } from '@/lib/client/home';
import { useMe } from '@/lib/client/me';
import { it } from '@/lib/i18n/it';

const h = it.home;

/** Show/hide and reorder the Home blocks (loaded when "Personalizza" is first pressed). */
export default function CustomizeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const me = useMe().data;
  const { layout, save } = useHomeLayout(me);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={h.customizeTitle}
      description={h.customizeHelp}
    >
      <ul className="flex flex-col gap-2">
        {layout.map((block, i) => {
          const name = h.blocks[block.id] ?? block.id;
          return (
            <li
              key={block.id}
              className="flex items-center gap-2 rounded-control border border-border bg-surface-solid px-3 py-1"
            >
              <div className="min-w-0 flex-1">
                <Switch
                  label={name}
                  checked={!block.hidden}
                  onCheckedChange={(checked) =>
                    void save(
                      layout.map((b) => (b.id === block.id ? { ...b, hidden: !checked } : b)),
                    )
                  }
                />
              </div>
              <GlassButton
                size="icon"
                variant="plain"
                aria-label={h.moveUp(name)}
                disabled={i === 0}
                onClick={() => void save(moveHomeBlock(layout, block.id, -1))}
              >
                <ChevronUp className="size-5" aria-hidden="true" />
              </GlassButton>
              <GlassButton
                size="icon"
                variant="plain"
                aria-label={h.moveDown(name)}
                disabled={i === layout.length - 1}
                onClick={() => void save(moveHomeBlock(layout, block.id, 1))}
              >
                <ChevronDown className="size-5" aria-hidden="true" />
              </GlassButton>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
