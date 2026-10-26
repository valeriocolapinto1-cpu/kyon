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
