/**
 * BISV school calendar — no-school days are blocked from carpooling.
 *
 * The calendar repeats every year by RULE (floating holidays computed from the
 * date), so any school year — 2026-27, 2027-28, 2030-31 — gets an accurate set
 * of breaks instead of everything past one hard-coded year falling into
 * "Summer". The rules reproduce the official 2026-27 BISV calendar exactly; swap
 * a rule below if the school ever changes a holiday pattern.
 */
import { parseISO, toISO } from '@/lib/dateUtils';

interface DateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  label: string;
}

interface SchoolYear {
  firstDay: string;
  lastDay: string;
  breaks: DateRange[];
  earlyDismissal: Record<string, string>;
}

export interface SchoolDayStatus {
  blocked: boolean;
  label: string | null;
}

// ---- date helpers (local time; app code, not a workflow script) -------------

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** nth (1-based) occurrence of `weekday` (0=Sun..6=Sat) in month `m` (1-12). */
function nthWeekday(y: number, m: number, weekday: number, n: number): Date {
  const first = new Date(y, m - 1, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return new Date(y, m - 1, 1 + shift + (n - 1) * 7);
}

/** Last occurrence of `weekday` in month `m` (1-12). */
function lastWeekday(y: number, m: number, weekday: number): Date {
  const last = new Date(y, m, 0); // day 0 of next month = last day of this one
  const shift = (last.getDay() - weekday + 7) % 7;
  return new Date(y, m - 1, last.getDate() - shift);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function inRange(iso: string, r: DateRange): boolean {
  return iso >= r.start && iso <= r.end; // ISO date strings sort lexicographically
}

// ---- school-year builder ----------------------------------------------------

/**
 * The academic year is identified by the August it starts in. A July–December
 * date belongs to the year starting that calendar year; Jan–June belongs to the
 * year that started the previous August.
 */
function academicStartYear(date: Date): number {
  const m = date.getMonth(); // 0 = Jan
  return m >= 6 ? date.getFullYear() : date.getFullYear() - 1;
}

const yearCache = new Map<number, SchoolYear>();

function getSchoolYear(startYear: number): SchoolYear {
  const cached = yearCache.get(startYear);
  if (cached) return cached;

  const Y = startYear; // fall semester year
  const Z = startYear + 1; // spring semester year

  const firstDay = nthWeekday(Y, 8, 1, 3); // 3rd Monday of August
  const lastDay = nthWeekday(Z, 6, 5, 2); // 2nd Friday of June

  const thanksgivingThu = nthWeekday(Y, 11, 4, 4); // 4th Thursday of November
  const winterStart = nthWeekday(Y, 12, 1, 3); // 3rd Monday of December
  const presidentsMon = nthWeekday(Z, 2, 1, 3); // 3rd Monday of February (Ski Week)
  const springMon = nthWeekday(Z, 4, 1, 1); // 1st Monday of April

  const breaks: DateRange[] = [
    one(nthWeekday(Y, 9, 1, 1), 'Labor Day'), // 1st Monday September
    one(nthWeekday(Y, 10, 5, 2), 'Fall Break'), // 2nd Friday October
    { start: ymd(Y, 11, 11), end: ymd(Y, 11, 11), label: 'Veterans Day' },
    range(addDays(thanksgivingThu, -3), addDays(thanksgivingThu, 1), 'Thanksgiving Break'),
    { start: toISO(winterStart), end: ymd(Z, 1, 1), label: 'Winter Break' },
    one(nthWeekday(Z, 1, 1, 3), 'MLK Day'), // 3rd Monday January
    range(presidentsMon, addDays(presidentsMon, 4), 'Ski Week'),
    range(springMon, addDays(springMon, 4), 'Spring Break'),
    one(lastWeekday(Z, 5, 1), 'Memorial Day'), // last Monday May
  ];

  // Non-blocking notes (carpool still runs; parents keep their set times).
  const earlyDismissal: Record<string, string> = {
    [toISO(firstDay)]: 'Early dismissal', // first day back
    [toISO(addDays(winterStart, -3))]: 'Early dismissal', // last Friday before Winter Break
  };

  const result: SchoolYear = {
    firstDay: toISO(firstDay),
    lastDay: toISO(lastDay),
    breaks,
    earlyDismissal,
  };
  yearCache.set(startYear, result);
  return result;
}

function one(d: Date, label: string): DateRange {
  const iso = toISO(d);
  return { start: iso, end: iso, label };
}

function range(start: Date, end: Date, label: string): DateRange {
  return { start: toISO(start), end: toISO(end), label };
}

// ---- public API -------------------------------------------------------------

/** First day of the 2026-27 school year — the rotation's fixed fairness epoch. */
export function schoolYearStart(): Date {
  return parseISO('2026-08-17');
}

/** Last day of the 2026-27 school year. */
export function schoolYearEnd(): Date {
  return parseISO('2027-06-11');
}

/**
 * Whether `date` is a school carpool day, plus an optional label
 * ("Winter Break", "Summer", "Early dismissal", …). Works for any year.
 */
export function schoolDayStatus(date: Date): SchoolDayStatus {
  const dow = date.getDay(); // 0 = Sun, 6 = Sat
  if (dow === 0 || dow === 6) return { blocked: true, label: null }; // weekend

  const iso = toISO(date);
  const year = getSchoolYear(academicStartYear(date));

  if (iso < year.firstDay || iso > year.lastDay) {
    return { blocked: true, label: 'Summer' };
  }

  for (const b of year.breaks) {
    if (inRange(iso, b)) return { blocked: true, label: b.label };
  }

  return { blocked: false, label: year.earlyDismissal[iso] ?? null };
}
