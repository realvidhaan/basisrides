/**
 * BISV school calendar — no-school days are blocked from carpooling.
 *
 * The 2026-27 Upper School (Grades 6–12) calendar is encoded EXACTLY from the
 * official PDF (B2602_011, rev 050826). That is the only year the app actually
 * runs over (see schoolYearStart/End), so it is the source of truth.
 *
 * For any OTHER year (e.g. if the calendar is scrolled far out) we fall back to
 * a rule-based approximation that floats the usual holidays from the date. Those
 * dates are best-effort only — replace them with the official PDF when BISV
 * publishes the next year's calendar.
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

/**
 * On early-dismissal days school lets out at 1:00 PM, so the carpool pickup is
 * forced to this time regardless of each parent's normally-set pickup time.
 */
export const EARLY_DISMISSAL_PICKUP = '13:00'; // 1:00 PM

// ---- exact 2026-27 calendar (from the official BISV PDF) --------------------

const SCHOOL_YEAR_2026_27: SchoolYear = {
  firstDay: '2026-08-12', // First Day of School (early dismissal)
  lastDay: '2027-06-04', // Last Day of School (end of Term Project Week)
  breaks: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day' },
    { start: '2026-09-08', end: '2026-09-08', label: 'Fall Break' },
    { start: '2026-10-09', end: '2026-10-09', label: 'Teacher Inservice' },
    { start: '2026-10-12', end: '2026-10-13', label: 'Fall Break' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Veterans Day' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving Break' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter Break' },
    { start: '2027-01-18', end: '2027-01-18', label: 'MLK Day' },
    { start: '2027-02-15', end: '2027-02-19', label: 'Ski Week' },
    { start: '2027-03-29', end: '2027-04-02', label: 'Spring Break' },
    { start: '2027-04-30', end: '2027-04-30', label: 'Spring Break' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day' },
    // Juneteenth (Jun 18) and Independence Day (Jul 5) observances fall after
    // the last day of school, so they are already covered by "Summer".
  ],
  // Non-blocking notes (carpool still runs; parents keep their set times).
  earlyDismissal: {
    '2026-08-12': 'Early dismissal', // First Day of School
    '2026-12-17': 'Early dismissal', // Teacher Inservice
    '2026-12-18': 'Early dismissal', // Last Day Before Winter Break
    '2027-04-29': 'Early dismissal', // Teacher Inservice
    '2027-06-01': 'Early dismissal', // Term Project Week
    '2027-06-02': 'Early dismissal',
    '2027-06-03': 'Early dismissal',
    '2027-06-04': 'Early dismissal',
  },
};

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
  // The authoritative, published year.
  if (startYear === 2026) return SCHOOL_YEAR_2026_27;

  const cached = yearCache.get(startYear);
  if (cached) return cached;

  const result = ruleBasedSchoolYear(startYear);
  yearCache.set(startYear, result);
  return result;
}

/**
 * Best-effort approximation for years BISV hasn't published yet: floats the
 * usual holidays from the date so a far-future date still gets sensible breaks
 * instead of everything falling into "Summer". Not authoritative.
 */
function ruleBasedSchoolYear(startYear: number): SchoolYear {
  const Y = startYear; // fall semester year
  const Z = startYear + 1; // spring semester year

  const firstDay = nthWeekday(Y, 8, 3, 2); // 2nd Wednesday of August
  const lastDay = nthWeekday(Z, 6, 5, 1); // 1st Friday of June

  const thanksgivingThu = nthWeekday(Y, 11, 4, 4); // 4th Thursday of November
  const winterStart = nthWeekday(Y, 12, 1, 3); // 3rd Monday of December
  const skiMon = nthWeekday(Z, 2, 1, 3); // 3rd Monday of February
  const springMon = nthWeekday(Z, 3, 1, 5); // last Monday of March (approx)

  const breaks: DateRange[] = [
    one(nthWeekday(Y, 9, 1, 1), 'Labor Day'), // 1st Monday September
    range(nthWeekday(Y, 10, 1, 2), addDays(nthWeekday(Y, 10, 1, 2), 1), 'Fall Break'),
    { start: ymd(Y, 11, 11), end: ymd(Y, 11, 11), label: 'Veterans Day' },
    range(addDays(thanksgivingThu, -2), addDays(thanksgivingThu, 1), 'Thanksgiving Break'),
    { start: toISO(winterStart), end: ymd(Z, 1, 1), label: 'Winter Break' },
    one(nthWeekday(Z, 1, 1, 3), 'MLK Day'), // 3rd Monday January
    range(skiMon, addDays(skiMon, 4), 'Ski Week'),
    range(springMon, addDays(springMon, 4), 'Spring Break'),
    one(lastWeekday(Z, 5, 1), 'Memorial Day'), // last Monday May
  ];

  const earlyDismissal: Record<string, string> = {
    [toISO(firstDay)]: 'Early dismissal',
    [toISO(addDays(winterStart, -3))]: 'Early dismissal',
  };

  return {
    firstDay: toISO(firstDay),
    lastDay: toISO(lastDay),
    breaks,
    earlyDismissal,
  };
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
  return parseISO(SCHOOL_YEAR_2026_27.firstDay);
}

/** Last day of the 2026-27 school year. */
export function schoolYearEnd(): Date {
  return parseISO(SCHOOL_YEAR_2026_27.lastDay);
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

/**
 * Whether `date` is an early-dismissal school day. On these days the carpool
 * pickup time is overridden to EARLY_DISMISSAL_PICKUP (1:00 PM).
 */
export function isEarlyDismissal(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false; // weekend
  const iso = toISO(date);
  const year = getSchoolYear(academicStartYear(date));
  if (iso < year.firstDay || iso > year.lastDay) return false; // summer
  return iso in year.earlyDismissal;
}
