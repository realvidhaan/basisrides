/**
 * Date helpers for the weekly carpool schedule.
 *
 * All formatting and ISO conversion use LOCAL date parts on purpose. The rides
 * table stores a plain `date` (no timezone); using `toISOString()` would convert
 * to UTC and can shift the day across midnight, so we never use it here.
 */

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

/** e.g. "Monday, Jun 9". */
export function formatDayLabel(date: Date): string {
  return `${DAYS_FULL[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** e.g. "Mon". */
export function formatShortDay(date: Date): string {
  return DAYS_SHORT[date.getDay()];
}

/** e.g. "Week of Jun 9" (formats whatever date is passed, normally the week start). */
export function formatWeekLabel(date: Date): string {
  return `Week of ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
