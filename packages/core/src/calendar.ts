/** Calendar math on plain days ("YYYY-MM-DD"): due dates are days, not instants. Weeks start on Monday. */

export type Day = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDay(date: Date): Day {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toDay(parseDay(value)) === value;
}

export function addDays(day: Day, days: number): Day {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

export function addMonths(day: Day, months: number): Day {
  const date = parseDay(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return toDay(target);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(day: Day): number {
  return (parseDay(day).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: Day): Day {
  return addDays(day, -weekday(day));
}

export function startOfMonth(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

/** The weeks (Monday→Sunday) covering the month of `day`: 4 to 6 rows of 7 days. */
export function monthGrid(day: Day): Day[][] {
  const first = startOfMonth(day);
  const month = first.slice(0, 7);
  const weeks: Day[][] = [];
  let cursor = startOfWeek(first);
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  } while (cursor.slice(0, 7) === month);
  return weeks;
}

export function weekDays(day: Day): Day[] {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Today as a day in `timeZone` (default Europe/Rome). */
export function today(timeZone = 'Europe/Rome', now = new Date()): Day {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}
