'use client';

import { Keyboard, Sparkles } from 'lucide-react';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { openShellPanel } from '@/lib/client/shellEvents';
import { it } from '@/lib/i18n/it';

export function HelpSettings() {
  return (
    <GlassCard as="section" aria-labelledby="help-title" className="flex flex-col gap-3">
      <h2 id="help-title" className="text-title3 font-semibold text-fg">
        {it.settings.help}
      </h2>
      <div className="flex flex-wrap gap-2">
        <GlassButton variant="glass" size="sm" onClick={() => openShellPanel('tour')}>
          <Sparkles className="size-4" aria-hidden="true" /> {it.tour.reopen}
        </GlassButton>
        <GlassButton variant="glass" size="sm" onClick={() => openShellPanel('shortcuts')}>
          <Keyboard className="size-4" aria-hidden="true" /> {it.shortcuts.open}
        </GlassButton>
      </div>
    </GlassCard>
  );
}
