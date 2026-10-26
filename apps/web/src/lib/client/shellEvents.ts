'use client';

import { useEffect } from 'react';

/** Panels owned by the app shell that other pages can open (Settings → "Rivedi il tour"). */
export type ShellPanel = 'tour' | 'shortcuts' | 'search';

const EVENT = 'kyon:open-panel';

export function openShellPanel(panel: ShellPanel) {
  window.dispatchEvent(new CustomEvent<ShellPanel>(EVENT, { detail: panel }));
}

export function useShellPanels(onOpen: (panel: ShellPanel) => void) {
  useEffect(() => {
    const listener = (event: Event) => onOpen((event as CustomEvent<ShellPanel>).detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [onOpen]);
}
