// src/lib/date-utils.ts
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

type DateInput = string | number | Date | null | undefined;

/**
 * Converts any date from Supabase to valid timestamp (ms)
 */
export function getSafeTimestamp(date: DateInput): number {
  if (!date) return 0;
  try {
    const dateString = (() => {
      if (typeof date !== 'string') return date;

      const normalized = date.replace(' ', 'T');
      const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
      return hasTimezone ? normalized : `${normalized}Z`;
    })();

    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

export function formatMessageDate(date: DateInput) {
  const ts = getSafeTimestamp(date);
  if (!ts) return '';
  const d = new Date(ts);

  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday, ${format(d, 'HH:mm')}`;

  return format(d, 'd MMM, HH:mm', { locale: uk });
}

export function formatRelativeTime(date: DateInput) {
  const ts = getSafeTimestamp(date);
  if (!ts) return '';
  const d = new Date(ts);

  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';

  return format(d, 'dd.MM.yy');
}

/**
 * Formats the "last seen" / entry time for a user.
 *
 * - Today → shows the time (HH:mm)
 * - Yesterday → "вчора, HH:mm"
 * - 2–6 days ago → "dd.MM, HH:mm"
 * - 7–29 days ago → relative description, e.g. "тиждень тому", "2 тижні тому"
 * - 30+ days ago → "давно"
 *
 * This is used for displaying when a user was last online, as opposed
 * to `formatRelativeTime` which is used for generic message timestamps.
 */
export function formatLastSeen(date: DateInput) {
  const ts = getSafeTimestamp(date);
  if (!ts) return '';

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const d = new Date(ts);

  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `вчора, ${format(d, 'HH:mm')}`;

  // Within the last week (2-6 days ago) → show date + time
  if (ts > oneWeekAgo) return format(d, 'dd.MM, HH:mm');

  // 30+ days ago → "long ago"
  if (ts <= thirtyDaysAgo) return 'давно';

  // 7-29 days ago → relative description via date-fns
  return formatDistanceToNow(d, { addSuffix: true, locale: uk });
}
