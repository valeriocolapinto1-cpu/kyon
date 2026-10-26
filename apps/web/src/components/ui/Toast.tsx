'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Reversible actions get an "Annulla" button. */
  action?: { label: string; onAction: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

const icons: Record<ToastTone, ReactNode> = {
  info: <Info className="size-5 text-accent-text" />,
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <AlertCircle className="size-5 text-danger" />,
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((options: ToastOptions) => {
    setItems((current) => [...current.slice(-2), { ...options, id: nextId++ }]);
  }, []);
  const remove = (id: number) => setItems((current) => current.filter((item) => item.id !== id));

  return (
    <ToastContext.Provider value={show}>
      <ToastPrimitive.Provider swipeDirection="down" label="Notifiche">
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            duration={item.durationMs ?? (item.action ? 7000 : 4000)}
            onOpenChange={(open) => !open && remove(item.id)}
            className={cn(
              'k-chrome flex w-full items-start gap-3 rounded-card p-4',
              'data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)]',
            )}
          >
            <span aria-hidden="true" className="mt-0.5">
              {icons[item.tone ?? 'info']}
            </span>
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-headline text-fg">
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="text-subhead text-muted">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            {item.action && (
              <ToastPrimitive.Action
                altText={item.action.label}
                onClick={item.action.onAction}
                className="k-pressable min-h-touch rounded-pill px-3 text-subhead font-semibold text-accent-text hover:bg-accent-soft"
              >
                {item.action.label}
              </ToastPrimitive.Action>
            )}
            <ToastPrimitive.Close
              aria-label={it.common.close}
              className="k-pressable inline-flex size-touch items-center justify-center rounded-full text-muted"
            >
              <X className="size-5" aria-hidden="true" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-[calc(6rem+var(--k-safe-bottom))] z-50 mx-auto flex max-w-md flex-col gap-2 outline-none md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-96" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return useMemo(() => ({ toast: show }), [show]);
}
