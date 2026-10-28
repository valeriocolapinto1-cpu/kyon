'use client';

import * as Slider from '@radix-ui/react-slider';
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN, type Preferences } from '@kyon/core';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { GlassCard } from '@/components/ui/GlassCard';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { it } from '@/lib/i18n/it';
import { usePreferences } from '@/lib/preferences/context';

type TriState = 'system' | 'on' | 'off';

const s = it.settings;
const triOptions = [
  { value: 'system' as const, label: s.followSystem },
  { value: 'on' as const, label: s.on },
  { value: 'off' as const, label: s.off },
];

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body text-fg">{label}</p>
        {help && <p className="text-footnote text-muted">{help}</p>}
      </div>
      {children}
    </div>
  );
}

/** Settings → Grafica and Accessibilità. Saved on this device for now (account sync from Fase 2). */
export function AppearanceSettings() {
  const { preferences: p, environment, resolved, update } = usePreferences();
  const scheme = resolved['data-scheme'] === 'dark' ? 'dark' : 'light';
  const contrastValue: TriState =
    p.contrast === 'system' ? 'system' : p.contrast === 'high' ? 'on' : 'off';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlassCard
        as="section"
        aria-labelledby="settings-appearance"
        className="divide-y divide-separator"
      >
        <h2 id="settings-appearance" className="pb-2 text-title3 font-semibold text-fg">
          {s.appearance}
        </h2>
        <Row label={s.theme}>
          <Segmented<Preferences['theme']>
            label={s.theme}
            value={p.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: s.themeSystem },
              { value: 'light', label: s.themeLight },
              { value: 'dark', label: s.themeDark },
            ]}
          />
        </Row>
        <div className="flex flex-col gap-3 py-3">
          <p className="text-body text-fg" id="accent-label">
            {s.accent}:{' '}
            <span className="font-semibold text-accent-text">{it.accents[p.accent]}</span>
          </p>
          <ColorSwatchPicker
            label={s.accent}
            value={p.accent}
            scheme={scheme}
            onChange={(accent) => update({ accent })}
          />
        </div>
        <Row
          label={s.lite}
          help={p.lite === 'auto' && environment.liteDetected ? s.liteDetected : s.liteHelp}
        >
          <Segmented<Preferences['lite']>
            label={s.lite}
            value={p.lite}
            onChange={(lite) => update({ lite })}
            options={[
              { value: 'auto', label: s.liteAuto },
              { value: 'on', label: s.liteOn },
              { value: 'off', label: s.liteOff },
            ]}
          />
        </Row>
      </GlassCard>

      <GlassCard as="section" aria-labelledby="settings-a11y" className="divide-y divide-separator">
        <h2 id="settings-a11y" className="pb-2 text-title3 font-semibold text-fg">
          {s.accessibility}
        </h2>
        <div className="flex flex-col gap-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body text-fg" id="text-size-label">
              {s.textSize}
            </p>
            <Switch
              label={s.textSizeSystem}
              checked={p.textScale === 'system'}
              onCheckedChange={(system) => update({ textScale: system ? 'system' : 1 })}
            />
          </div>
          {p.textScale !== 'system' && (
            <Slider.Root
              className="relative flex h-touch w-full touch-none items-center select-none"
              min={TEXT_SCALE_MIN}
              max={TEXT_SCALE_MAX}
              step={0.05}
              value={[p.textScale]}
              onValueChange={([value]) => value !== undefined && update({ textScale: value })}
            >
              <Slider.Track className="relative h-1.5 grow rounded-pill bg-neutral-soft">
                <Slider.Range className="absolute h-full rounded-pill bg-accent-fill" />
              </Slider.Track>
              <Slider.Thumb
                aria-labelledby="text-size-label"
                aria-valuetext={`${Math.round(p.textScale * 100)}%`}
                className="block size-7 rounded-full border border-input-border bg-white shadow-md"
              />
            </Slider.Root>
          )}
        </div>
        <Row label={s.contrast}>
          <Segmented<TriState>
            label={s.contrast}
            value={contrastValue}
            onChange={(v) =>
              update({ contrast: v === 'system' ? 'system' : v === 'on' ? 'high' : 'normal' })
            }
            options={triOptions}
          />
        </Row>
        <Row label={s.reduceTransparency}>
          <Segmented<TriState>
            label={s.reduceTransparency}
            value={p.reduceTransparency}
            onChange={(reduceTransparency) => update({ reduceTransparency })}
            options={triOptions}
          />
        </Row>
        <Row label={s.reduceMotion}>
          <Segmented<TriState>
            label={s.reduceMotion}
            value={p.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
            options={triOptions}
          />
        </Row>
        <div className="py-1">
          <Switch
            label={s.nonColor}
            help={s.nonColorHelp}
            checked={p.nonColor}
            onCheckedChange={(nonColor) => update({ nonColor })}
          />
        </div>
        <div className="py-1">
          <Switch
            label={s.announceMessages}
            help={s.announcementsHelp}
            checked={p.announceMessages}
            onCheckedChange={(announceMessages) => update({ announceMessages })}
          />
        </div>
        <div className="py-1">
          <Switch
            label={s.announceLive}
            checked={p.announceLive}
            onCheckedChange={(announceLive) => update({ announceLive })}
          />
        </div>
      </GlassCard>
    </div>
  );
}
