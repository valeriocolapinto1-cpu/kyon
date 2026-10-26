'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, m, useDragControls, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useReducedMotion } from '@/lib/preferences/context';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Where focus goes after closing (default: back to the trigger). */
  onCloseAutoFocus?: (event: Event) => void;
}

const spring = { type: 'spring', stiffness: 420, damping: 40 } as const;

/**
 * Bottom sheet on phones (drag the handle down to close), centered dialog from tablet up.
 * Focus goes to the title on open and back to the trigger on close (Radix restores it).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onCloseAutoFocus,
}: SheetProps) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const reduced = useReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dragControls = useDragControls();

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-40 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onCloseAutoFocus={onCloseAutoFocus}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                titleRef.current?.focus();
              }}
            >
              <m.div
                className={cn(
                  'k-chrome fixed z-50 flex max-h-[90dvh] flex-col outline-none',
                  desktop
                    ? 'top-1/2 left-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-sheet'
                    : 'inset-x-0 bottom-0 rounded-t-sheet pb-[var(--k-safe-bottom)]',
                )}
                initial={desktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
                animate={desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
                exit={desktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
                transition={reduced ? { duration: 0 } : spring}
                drag={desktop || reduced ? false : 'y'}
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
              >
                {!desktop && (
                  <div
                    className="flex h-6 cursor-grab touch-none items-center justify-center"
                    onPointerDown={(event) => dragControls.start(event)}
                    aria-hidden="true"
                  >
                    <span className="h-1.5 w-10 rounded-pill bg-separator" />
                  </div>
                )}
                <div className={cn('flex items-start gap-2 px-5', desktop ? 'pt-5' : 'pt-1')}>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title
                      ref={titleRef}
                      tabIndex={-1}
                      className="text-title3 font-semibold text-fg outline-none"
                    >
                      {title}
                    </Dialog.Title>
                    {description ? (
                      <Dialog.Description className="text-subhead text-muted">
                        {description}
                      </Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    aria-label={it.common.close}
                    className="k-pressable -mt-2 -mr-2 inline-flex size-touch items-center justify-center rounded-full text-muted hover:bg-neutral-soft"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
                {footer && (
                  <div className="flex justify-end gap-2 border-t border-separator px-5 py-3">
                    {footer}
                  </div>
                )}
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
