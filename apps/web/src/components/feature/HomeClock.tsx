'use client';

import { ClockAnalog, ClockDigital } from '@/components/ui/Clock';
import { usePreferences } from '@/lib/preferences/context';

export function HomeClock() {
  const { preferences } = usePreferences();
  return preferences.clockStyle === 'digital' ? <ClockDigital /> : <ClockAnalog />;
}
