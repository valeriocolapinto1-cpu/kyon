import { parseDay, type Day } from '@kyon/core';
import { lazy } from './lazy';

// Days are calendar days ("YYYY-MM-DD"), formatted in UTC so they never shift by a time zone.
const short = lazy(
  () => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
);
const long = lazy(
  () =>
    new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
);
const monthYear = lazy(
  () =>
    new Intl.DateTimeFormat('it-IT', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
);

/** "3 nov" */
export const formatDayShort = (day: Day) => short().format(parseDay(day));
/** "martedì 3 novembre 2026" */
export const formatDayLong = (day: Day) => long().format(parseDay(day));
/** "novembre 2026" */
export const formatMonth = (day: Day) => monthYear().format(parseDay(day));
