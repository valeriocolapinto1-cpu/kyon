'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { SheetProps } from './SheetImpl';

const load = () => import('./SheetImpl');
const SheetImpl = dynamic(load, { ssr: false });

let prefetched = false;
const EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Bottom sheet on phones, dialog from tablet up (implementation in SheetImpl). Its code
 * (motion, Radix Dialog) loads at the first touch, click or key press, or when a sheet opens,
 * so it never weighs on page load.
 */
export function Sheet(props: SheetProps) {
  const [used, setUsed] = useState(props.open);
  if (props.open && !used) setUsed(true);
  useEffect(() => {
    if (prefetched) return;
    prefetched = true;
    // On the first gesture (the press before the click that opens a sheet), not while the page
    // loads: evaluating motion + Radix is a long task a phone shouldn't pay up front.
    const go = () => {
      for (const type of EVENTS) window.removeEventListener(type, go, true);
      void load().catch((error: unknown) => console.warn('Sheet prefetch failed', error));
    };
    for (const type of EVENTS) window.addEventListener(type, go, { capture: true, passive: true });
  }, []);
  return used ? <SheetImpl {...props} /> : null;
}
