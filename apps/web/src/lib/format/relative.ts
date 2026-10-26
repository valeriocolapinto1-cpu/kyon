const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });

/** "2 minuti fa", "ieri", "tra 3 giorni". */
export function relativeTime(date: Date | string, now = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'adesso';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30)), 'month');
  return rtf.format(Math.round(seconds / (86400 * 365)), 'year');
}
