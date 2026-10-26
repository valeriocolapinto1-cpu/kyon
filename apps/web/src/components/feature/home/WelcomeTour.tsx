'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';
import { Sheet } from '@/components/ui/Sheet';
import { api } from '@/lib/client/api';
import { meKey, useMe, type Me } from '@/lib/client/me';
import { it } from '@/lib/i18n/it';

const t = it.tour;

/**
 * A few steps on first access (skippable), reopenable from Settings or the palette.
 * Finishing or skipping is remembered in the account, so it never shows up twice.
 */
export function WelcomeTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMe().data;
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const firstTime = Boolean(me && !me.tourDoneAt) && !dismissed;
  const visible = open || firstTime;
  const total = t.steps.length;
  const current = t.steps[step] ?? t.steps[0];

  const close = () => {
    setDismissed(true);
    setStep(0);
    onOpenChange(false);
    if (me && !me.tourDoneAt) {
      queryClient.setQueryData<Me>(meKey, (m) =>
        m ? { ...m, tourDoneAt: new Date().toISOString() } : m,
      );
      api('/api/me/tour', { method: 'PUT', json: { done: true } }).catch((error: unknown) =>
        console.warn('Cannot save the tour state', error),
      );
    }
  };

  return (
    <Sheet
      open={visible}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={current?.title ?? t.title}
      description={t.step(step + 1, total)}
      readingContent
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GlassButton variant="plain" size="sm" onClick={close}>
            {t.skip}
          </GlassButton>
          <div className="flex gap-2">
            {step > 0 && (
              <GlassButton variant="glass" size="sm" onClick={() => setStep(step - 1)}>
                {t.back}
              </GlassButton>
            )}
            {step < total - 1 ? (
              <GlassButton variant="primary" size="sm" onClick={() => setStep(step + 1)}>
                {t.next}
              </GlassButton>
            ) : (
              <GlassButton variant="primary" size="sm" onClick={close}>
                {t.done}
              </GlassButton>
            )}
          </div>
        </div>
      }
    >
      <p className="text-body text-fg">{current?.body}</p>
      <ol className="mt-4 flex justify-center gap-2" aria-hidden="true">
        {t.steps.map((s, i) => (
          <li
            key={s.title}
            className={`size-2 rounded-full ${i === step ? 'bg-accent-fill' : 'bg-separator'}`}
          />
        ))}
      </ol>
    </Sheet>
  );
}
