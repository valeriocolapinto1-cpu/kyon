'use client';

import { LazyMotion, domMax } from 'motion/react';
import { Inbox, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ACCENT_IDS, type AccentId } from '@kyon/core';
import { AppearanceSettings } from '@/components/feature/AppearanceSettings';
import { Logo } from '@/components/shell/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ClockAnalog, ClockDigital } from '@/components/ui/Clock';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { SyncIndicator } from '@/components/ui/SyncIndicator';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { TabBarPill } from '@/components/shell/TabBarPill';
import { SidebarPill } from '@/components/shell/SidebarPill';
import { usePreferences } from '@/lib/preferences/context';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`dev-${title}`} className="flex flex-col gap-3">
      <h2 id={`dev-${title}`} className="text-title2 font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <GlassButton
        onClick={() =>
          toast({
            title: 'Task spuntata',
            tone: 'success',
            action: { label: 'Annulla', onAction: () => toast({ title: 'Annullato' }) },
          })
        }
      >
        Toast con Annulla
      </GlassButton>
      <GlassButton
        onClick={() =>
          toast({
            title: 'Commit non riuscito',
            description: 'GitHub non risponde.',
            tone: 'error',
          })
        }
      >
        Toast di errore
      </GlassButton>
    </div>
  );
}

/** Every component in every state. Use the settings panel to switch theme, accent and contrast. */
export function DevGallery() {
  const { resolved } = usePreferences();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [segment, setSegment] = useState<'kanban' | 'lista' | 'calendario'>('kanban');
  const [accent, setAccent] = useState<AccentId>('green');
  const [on, setOn] = useState(true);
  const scheme = resolved['data-scheme'] === 'dark' ? 'dark' : 'light';

  return (
    <LazyMotion features={domMax} strict>
      <ToastProvider>
        <div className="k-mesh" aria-hidden="true" />
        <main className="mx-auto flex max-w-content flex-col gap-10 px-4 py-8 pb-40">
          <header className="flex items-center gap-3">
            <Logo className="size-12" />
            <h1 className="text-large font-bold text-fg">Design system</h1>
          </header>

          <Section title="Impostazioni (tema, accento, accessibilità)">
            <AppearanceSettings />
          </Section>

          <Section title="GlassCard">
            <div className="grid gap-4 sm:grid-cols-2">
              <GlassCard>
                <p className="text-headline text-fg">Card statica</p>
                <p className="text-subhead text-muted">
                  Testo secondario sempre leggibile sul vetro.
                </p>
              </GlassCard>
              <GlassCard as="button" type="button" interactive className="text-left">
                <p className="text-headline text-fg">Card interattiva</p>
                <p className="text-subhead text-accent-text">Premi per sentire il vetro</p>
              </GlassCard>
            </div>
          </Section>

          <Section title="GlassButton">
            <div className="flex flex-wrap items-center gap-2">
              <GlassButton variant="primary">
                <Plus className="size-5" aria-hidden="true" /> Nuova task
              </GlassButton>
              <GlassButton>Vetro</GlassButton>
              <GlassButton variant="plain">Semplice</GlassButton>
              <GlassButton variant="danger">
                <Trash2 className="size-5" aria-hidden="true" /> Elimina
              </GlassButton>
              <GlassButton variant="primary" disabled>
                Disattivato
              </GlassButton>
              <GlassButton size="icon" aria-label="Aggiungi">
                <Plus className="size-5" aria-hidden="true" />
              </GlassButton>
            </div>
          </Section>

          <Section title="GlassInput">
            <div className="grid gap-4 sm:grid-cols-2">
              <GlassInput
                label="Email"
                type="email"
                placeholder="nome@esempio.it"
                hint="Non la mostriamo a nessuno."
              />
              <GlassInput label="Password" type="password" error="Almeno 12 caratteri." />
            </div>
          </Section>

          <Section title="Segmented">
            <Segmented
              label="Vista"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'kanban', label: 'Kanban' },
                { value: 'lista', label: 'Lista' },
                { value: 'calendario', label: 'Calendario' },
              ]}
            />
          </Section>

          <Section title="Switch">
            <GlassCard>
              <Switch
                label="Notifiche push"
                help="Solo sulla PWA installata."
                checked={on}
                onCheckedChange={setOn}
              />
            </GlassCard>
          </Section>

          <Section title="Avatar e Badge">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name="Valerio Colapinto" size="lg" online />
              <Avatar name="Christian" online={false} />
              <Avatar name="Cerbero" size="sm" />
              <Badge>Neutro</Badge>
              <Badge tone="accent">Accento</Badge>
              <Badge tone="success">Fatto</Badge>
              <Badge tone="warning">In attesa</Badge>
              <Badge tone="danger">CI rossa</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['urgent', 'high', 'medium', 'low', 'none'] as const).map((p) => (
                <PriorityBadge key={p} priority={p} />
              ))}
            </div>
          </Section>

          <Section title="SyncIndicator">
            <div className="flex flex-col gap-1">
              {(['idle', 'saving', 'saved', 'error', 'offline'] as const).map((state) => (
                <SyncIndicator key={state} state={state} onRetry={() => undefined} />
              ))}
            </div>
          </Section>

          <Section title="Orologi">
            <div className="flex flex-wrap items-center gap-6">
              <ClockAnalog />
              <ClockDigital />
            </div>
          </Section>

          <Section title="ColorSwatchPicker">
            <ColorSwatchPicker
              label="Colore di prova"
              value={accent}
              scheme={scheme}
              onChange={setAccent}
            />
            <p className="text-footnote text-muted">
              {ACCENT_IDS.length} accenti di sistema Apple.
            </p>
          </Section>

          <Section title="Skeleton">
            <Skeleton className="h-6 w-48" />
            <SkeletonList rows={2} />
          </Section>

          <Section title="EmptyState">
            <EmptyState
              icon={<Inbox className="size-10" />}
              title="Niente qui"
              body="Quando ci sarà qualcosa lo vedrai subito."
              action={<GlassButton variant="primary">Crea TASKS.md</GlassButton>}
            />
          </Section>

          <Section title="Sheet / Dialog, Toast, CommandPalette">
            <div className="flex flex-wrap gap-2">
              <GlassButton onClick={() => setSheetOpen(true)}>Apri sheet</GlassButton>
              <GlassButton onClick={() => setPaletteOpen(true)}>Apri palette</GlassButton>
            </div>
            <ToastDemo />
            <Sheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              title="Dettaglio task"
              description="Trascina in basso per chiudere (su telefono)."
              footer={
                <>
                  <GlassButton variant="plain" onClick={() => setSheetOpen(false)}>
                    Annulla
                  </GlassButton>
                  <GlassButton variant="primary" onClick={() => setSheetOpen(false)}>
                    Salva
                  </GlassButton>
                </>
              }
            >
              <GlassInput label="Titolo" defaultValue="Aggiungere il grafico dei progressi" />
            </Sheet>
            <CommandPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              items={[
                { id: 'a', label: 'Home', group: 'Vai a', href: '/' },
                { id: 'b', label: 'Progetti', group: 'Vai a', href: '/progetti' },
              ]}
            />
          </Section>

          <Section title="Navigazione">
            <p className="text-subhead text-muted">
              Tab bar (telefono) e sidebar (tablet/desktop) sono visibili ai bordi.
            </p>
          </Section>
        </main>
        <TabBarPill />
        <SidebarPill onSearch={() => setPaletteOpen(true)} />
      </ToastProvider>
    </LazyMotion>
  );
}
