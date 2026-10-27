import { DEFAULT_TIME_ZONE } from './limits';

export interface ClockParts {
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('it-IT', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock hour/minute/second of `date` in `timeZone` (default Europe/Rome). */
export function zonedClock(date: Date, timeZone: string = DEFAULT_TIME_ZONE): ClockParts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/**
 * Offset of `timeZone` from UTC at `date`, in ms (e.g. +7_200_000 for Rome in summer).
 * Changes only at DST switches: callers can compute it once a minute and do plain arithmetic
 * per frame (the analog clock), instead of an Intl call 60 times a second.
 */
export function zoneOffsetMs(date: Date, timeZone: string = DEFAULT_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Clock parts from a UTC instant and a known zone offset (no Intl: cheap enough per frame). */
export function clockAt(epochMs: number, offsetMs: number): ClockParts {
  const local = new Date(epochMs + offsetMs);
  return {
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  };
}

/** "HH:MM" in `timeZone`. */
export function formatClock(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const { hour, minute } = zonedClock(date, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Hand angles in degrees, 0 = 12 o'clock. `ms` makes the second hand sweep. */
export function handAngles({ hour, minute, second }: ClockParts, ms = 0) {
  const s = second + ms / 1000;
  const m = minute + s / 60;
  const h = (hour % 12) + m / 60;
  return { hour: h * 30, minute: m * 6, second: s * 6 };
}
