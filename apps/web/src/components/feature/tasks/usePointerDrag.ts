'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const MOUSE_SLOP = 6;
const TOUCH_SLOP = 10;
const LONG_PRESS_MS = 350;
const EDGE = 48;

interface Session<T> {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  touch: boolean;
  active: boolean;
  source: HTMLElement;
  ghost: HTMLElement | null;
  offsetX: number;
  offsetY: number;
  target: T | null;
  timer?: ReturnType<typeof setTimeout>;
  frame?: number;
  x: number;
  y: number;
}

/**
 * Drag and drop with pointer events, for mouse and touch alike (HTML5 drag and drop doesn't work
 * on iPhone). Touch drags start with a long press, so normal scrolling is untouched; once a drag
 * starts the page stops scrolling and auto-scrolls near the edges of `[data-drag-scroll]`.
 * Esc cancels. Drag is never the only way: every move also exists as a menu and a key.
 */
export function usePointerDrag<T>({
  enabled,
  resolveTarget,
  onDrop,
  reducedMotion,
}: {
  enabled: boolean;
  resolveTarget: (x: number, y: number, id: string) => T | null;
  onDrop: (id: string, target: T) => void;
  reducedMotion: boolean;
}) {
  const [drag, setDrag] = useState<{ id: string; target: T | null } | null>(null);
  const session = useRef<Session<T> | null>(null);
  const callbacks = useRef({ resolveTarget, onDrop });
  useEffect(() => {
    callbacks.current = { resolveTarget, onDrop };
  });

  const end = useCallback((drop: boolean) => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    clearTimeout(s.timer);
    if (s.frame) cancelAnimationFrame(s.frame);
    s.ghost?.remove();
    s.source.removeAttribute('data-dragging');
    document.documentElement.removeAttribute('data-drag-active');
    if (s.active) {
      // The click that follows pointerup must not open the card.
      const swallow = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (drop && s.target) callbacks.current.onDrop(s.id, s.target);
    }
    setDrag(null);
  }, []);

  const activate = useCallback(
    (s: Session<T>) => {
      s.active = true;
      const rect = s.source.getBoundingClientRect();
      s.offsetX = s.startX - rect.left;
      s.offsetY = s.startY - rect.top;
      const ghost = s.source.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: '0px',
        top: '0px',
        width: `${rect.width}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '60',
        boxShadow: 'var(--k-shadow-3)',
        transform: `translate(${rect.left}px, ${rect.top}px)${reducedMotion ? '' : ' rotate(2deg) scale(1.03)'}`,
        transition: 'none',
      });
      ghost.dataset.dragGhost = '';
      document.body.appendChild(ghost);
      s.ghost = ghost;
      s.source.setAttribute('data-dragging', '');
      document.documentElement.setAttribute('data-drag-active', '');
      if (s.touch) navigator.vibrate?.(10);
      setDrag({ id: s.id, target: null });
    },
    [reducedMotion],
  );

  const update = useCallback(
    (s: Session<T>) => {
      s.frame = undefined;
      if (s.ghost)
        s.ghost.style.transform = `translate(${s.x - s.offsetX}px, ${s.y - s.offsetY}px)${reducedMotion ? '' : ' rotate(2deg) scale(1.03)'}`;
      // Auto-scroll the board horizontally and the page vertically near the edges.
      const scroller = document
        .elementFromPoint(s.x, s.y)
        ?.closest<HTMLElement>('[data-drag-scroll]');
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (s.x < r.left + EDGE) scroller.scrollBy({ left: -12 });
        else if (s.x > r.right - EDGE) scroller.scrollBy({ left: 12 });
      }
      if (s.y < EDGE) window.scrollBy({ top: -12 });
      else if (s.y > window.innerHeight - EDGE) window.scrollBy({ top: 12 });
      const target = callbacks.current.resolveTarget(s.x, s.y, s.id);
      if (JSON.stringify(target) !== JSON.stringify(s.target)) {
        s.target = target;
        setDrag({ id: s.id, target });
      }
    },
    [reducedMotion],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const s = session.current;
      if (!s || event.pointerId !== s.pointerId) return;
      s.x = event.clientX;
      s.y = event.clientY;
      const distance = Math.hypot(s.x - s.startX, s.y - s.startY);
      if (!s.active) {
        if (s.touch) {
          if (distance > TOUCH_SLOP) end(false); // it's a scroll
          return;
        }
        if (distance < MOUSE_SLOP) return;
        activate(s);
      }
      s.frame ??= requestAnimationFrame(() => update(s));
    };
    const onUp = (event: PointerEvent) => {
      if (session.current?.pointerId === event.pointerId) end(true);
    };
    const onCancel = (event: PointerEvent) => {
      if (session.current?.pointerId === event.pointerId) end(false);
    };
    // iOS: once a drag is active, stop the page from scrolling under the finger.
    const onTouchMove = (event: TouchEvent) => {
      if (session.current?.active) event.preventDefault();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && session.current?.active) {
        event.preventDefault();
        end(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      end(false);
    };
  }, [activate, end, update]);

  const handle = useCallback(
    (id: string) => (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0 || session.current) return;
      const source = event.currentTarget.closest<HTMLElement>('[data-drag-source]');
      if (!source) return;
      const touch = event.pointerType === 'touch';
      const s: Session<T> = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        touch,
        active: false,
        source,
        ghost: null,
        offsetX: 0,
        offsetY: 0,
        target: null,
      };
      session.current = s;
      if (touch)
        s.timer = setTimeout(() => {
          if (session.current === s) {
            activate(s);
            update(s);
          }
        }, LONG_PRESS_MS);
    },
    [activate, enabled, update],
  );

  return { drag, handle };
}
