// Day arithmetic in the display's time zone. A "day key" is "YYYY-MM-DD"; it is handled as a plain
// calendar date (never a moment in time), so adding days is safe across daylight saving changes.
import * as config from './config.mjs';

const pad = (n) => String(n).padStart(2, '0');

/** The day key of an instant, as it is in `tz`. */
export function dayKey(date, tz = config.TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** The day key of a date-only value, which node-ical builds at local midnight of the machine's own zone. */
export const dateOnlyKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toUtc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

export const addDays = (key, n) => fromUtc(toUtc(key) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
/** 0 = Sunday ... 6 = Saturday. */
export const weekday = (key) => new Date(toUtc(key)).getUTCDay();
export const monthOf = (key) => key.slice(0, 7);
export const dayOfMonth = (key) => Number(key.slice(8, 10));

/** The weeks (arrays of seven day keys, Sunday first) that cover the month containing `key`. */
export function monthWeeks(key) {
  const first = `${monthOf(key)}-01`;
  const lastDay = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  const last = `${monthOf(key)}-${pad(lastDay)}`;
  const start = addDays(first, -weekday(first));
  const end = addDays(last, 6 - weekday(last));
  const weeks = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

export const monthTitle = (key) => new Date(toUtc(key)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
export const longDay = (key) => new Date(toUtc(key)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
export const fullDay = (key) => new Date(toUtc(key)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const shortDay = (key) => new Date(toUtc(key)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
export const dayName = (key) => new Date(toUtc(key)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' });

/** "9:30 AM" for an instant, in `tz`. */
export const clock = (date, tz = config.TIMEZONE) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(date);

/** Minutes since midnight of an instant, in `tz`. */
export function minuteOfDay(date, tz = config.TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return (get('hour') % 24) * 60 + get('minute');
}
