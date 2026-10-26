'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock, handAngles, zonedClock } from '@kyon/core';
import { it } from '@/lib/i18n/it';
import { useReducedMotion } from '@/lib/preferences/context';

/** Minute-level label for screen readers: never updates every second. */
function useMinuteLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let timer = 0;
    const update = () => {
      setLabel(formatClock(new Date()));
      timer = window.setTimeout(update, 60_000 - (Date.now() % 60_000) + 50);
    };
    update();
    return () => window.clearTimeout(timer);
  }, []);
  return label;
}

export function ClockAnalog({ size = 132 }: { size?: number }) {
  const label = useMinuteLabel();
  const reduced = useReducedMotion();
  const hourRef = useRef<SVGLineElement>(null);
  const minuteRef = useRef<SVGLineElement>(null);
  const secondRef = useRef<SVGGElement>(null);

  // Hands are moved by writing transforms directly: no React render per frame.
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const draw = () => {
      const now = new Date();
      const angles = handAngles(zonedClock(now), reduced ? 0 : now.getMilliseconds());
      hourRef.current?.setAttribute('transform', `rotate(${angles.hour} 50 50)`);
      minuteRef.current?.setAttribute('transform', `rotate(${angles.minute} 50 50)`);
      secondRef.current?.setAttribute('transform', `rotate(${angles.second} 50 50)`);
    };
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (reduced) {
      draw();
      timer = window.setInterval(draw, 1000);
    } else {
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, [reduced]);

  return (
    <div
      role="img"
      aria-label={label ? it.clock.label(label) : it.common.loading}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r="48"
          className="fill-surface-solid stroke-separator"
          strokeWidth="1"
        />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1={i % 3 === 0 ? 6 : 8}
            x2="50"
            y2="12"
            transform={`rotate(${i * 30} 50 50)`}
            className="stroke-muted"
            strokeWidth={i % 3 === 0 ? 2.5 : 1.5}
            strokeLinecap="round"
          />
        ))}
        <line
          ref={hourRef}
          x1="50"
          y1="52"
          x2="50"
          y2="27"
          className="stroke-fg"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line
          ref={minuteRef}
          x1="50"
          y1="54"
          x2="50"
          y2="15"
          className="stroke-fg"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g ref={secondRef}>
          <line
            x1="50"
            y1="58"
            x2="50"
            y2="12"
            className="stroke-accent-text"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="2.5" className="fill-accent-text" />
        </g>
      </svg>
    </div>
  );
}

export function ClockDigital() {
  const label = useMinuteLabel();
  return (
    <p className="text-large font-semibold text-fg tabular-nums">
      <span className="sr-only">{label ? it.clock.label(label) : it.common.loading}</span>
      <span aria-hidden="true">{label ?? '--:--'}</span>
    </p>
  );
}
