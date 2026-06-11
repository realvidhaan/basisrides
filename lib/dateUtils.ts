/**
 * Date helpers for the weekly carpool schedule.
 *
 * All formatting and ISO conversion use LOCAL date parts on purpose. The rides
 * table stores a plain `date` (no timezone); using `toISOString()` would convert
 * to UTC and can shift the day across midnight, so we never use it here.
 */

import type { WeekdayKey } from '@/types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const DAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function startOfDay(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday (00:00 local) of the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const day = date.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // Sunday rolls back to the previous Monday
  return addDays(date, diff);
}

/** Friday of the week containing `date`. */
export function getWeekEnd(date: Date): Date {
  return addDays(getWeekStart(date), 4);
}

/** Five Date objects, Monday through Friday, for the given week start. */
export function getWeekDates(weekStart: Date): Date[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD. */
export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parse a local YYYY-MM-DD back into a local Date (no UTC shift). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return new Date(y, m - 1, d);
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed Monday epoch used to rotate the driver each week. Any fixed Monday works.
const WEEK_EPOCH_UTC = Date.UTC(2026, 0, 5); // Monday, Jan 5 2026

/**
 * Whole weeks between `date` and the fixed epoch (can be negative). Used to
 * rotate which car-owner drives each calendar week. Computed from the local
 * Y/M/D via UTC to avoid DST drift.
 */
export function weekIndex(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((utc - WEEK_EPOCH_UTC) / (7 * DAY_MS));
}

/** e.g. "Monday, Jun 9". */
export function formatDayLabel(date: Date): string {
  return `${DAYS_FULL[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** e.g. "Mon". */
export function formatShortDay(date: Date): string {
  return DAYS_SHORT[date.getDay()];
}

/** e.g. "Jun 9" — month + day, no weekday or year. */
export function formatMonthDay(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** e.g. "Week of Jun 9" (formats whatever date is passed, normally the week start). */
export function formatWeekLabel(date: Date): string {
  return `Week of ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** e.g. "June 2026" — full month + year, for the calendar header. */
export function formatMonthYear(date: Date): string {
  return `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** The five carpool weekdays, Monday-first, with display labels. */
export const WEEKDAYS: { key: WeekdayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
];

const DAY_INDEX_TO_KEY: Record<number, WeekdayKey> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
};

/** Maps a Date to its carpool weekday key, or null for weekends. */
export function weekdayKeyFromDate(date: Date): WeekdayKey | null {
  return DAY_INDEX_TO_KEY[date.getDay()] ?? null;
}

/**
 * Formats a Postgres TIME ("HH:MM" or "HH:MM:SS") as a 12-hour label, e.g.
 * "15:15:00" -> "3:15 PM". Returns "" for null/empty.
 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const parts = value.split(':');
  const h = Number(parts[0]);
  const m = parts[1] ?? '00';
  if (Number.isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.padStart(2, '0')} ${ampm}`;
}
