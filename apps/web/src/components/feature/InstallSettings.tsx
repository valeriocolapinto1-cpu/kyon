'use client';

import { Download, Share } from 'lucide-react';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { useInstall } from '@/lib/client/pwa';
import { it } from '@/lib/i18n/it';

const p = it.pwa;

/** Settings → Installazione: the native prompt on Chrome/Edge, a step-by-step guide on iOS. */
export function InstallSettings() {
  const { state, install } = useInstall();
  return (
    <GlassCard as="section" aria-labelledby="install-title" className="flex flex-col gap-3">
      <div>
        <h2 id="install-title" className="text-title3 font-semibold text-fg">
          {p.installTitle}
        </h2>
        <p className="text-subhead text-muted">{p.installHelp}</p>
      </div>
      {state === 'installed' ? (
        <p className="text-subhead text-fg">{p.installed}</p>
      ) : state === 'prompt' ? (
        <GlassButton
          variant="primary"
          size="sm"
          className="self-start"
          onClick={() => void install()}
        >
          <Download className="size-4" aria-hidden="true" /> {p.installButton}
        </GlassButton>
      ) : state === 'ios' ? (
        <ol className="flex list-decimal flex-col gap-1 pl-6 text-subhead text-fg">
          {p.iosSteps.map((step, i) => (
            <li key={step}>
              {step}
              {i === 1 && <Share className="ml-1 inline size-4" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      ) : state === 'manual' ? (
        <p className="text-subhead text-fg">{p.manual}</p>
      ) : null}
    </GlassCard>
  );
}
