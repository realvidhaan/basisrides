/**
 * BISV school calendar — no-school days are blocked from carpooling.
 *
 * Derived from the 2023–24 Upper School calendar PDF, mapped to the 2026–27
 * school year so blocking is visible now. Swap in the official calendar each
 * year by editing SCHOOL_YEAR / BREAKS / EARLY_DISMISSAL below — nothing else
 * needs to change.
 */
import { toISO } from '@/lib/dateUtils';

interface DateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  label: string;
}

const SCHOOL_YEAR = {
  firstDay: '2026-08-17',
  lastDay: '2027-06-11',
};

// Breaks & single holidays (inclusive ranges).
const BREAKS: DateRange[] = [
  { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day' },
  { start: '2026-10-09', end: '2026-10-10', label: 'Fall Break' },
  { start: '2026-11-11', end: '2026-11-11', label: 'Veterans Day' },
  { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving Break' },
  { start: '2026-12-21', end: '2027-01-01', label: 'Winter Break' },
  { start: '2027-01-18', end: '2027-01-18', label: 'MLK Day' },
  { start: '2027-02-15', end: '2027-02-19', label: 'Ski Week' },
  { start: '2027-04-05', end: '2027-04-09', label: 'Spring Break' },
  { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day' },
];

// Non-blocking notes (carpool still runs; parents keep their set times).
const EARLY_DISMISSAL: Record<string, string> = {
  '2026-08-17': 'Early dismissal',
  '2026-12-18': 'Early dismissal',
  '2027-05-24': 'Early dismissal',
};

export interface SchoolDayStatus {
  blocked: boolean;
  label: string | null;
}

function inRange(iso: string, r: DateRange): boolean {
  return iso >= r.start && iso <= r.end; // ISO date strings sort lexicographically
}

/**
 * Whether `date` is a school carpool day, plus an optional label
 * ("Winter Break", "Summer", "Early dismissal", …).
 */
export function schoolDayStatus(date: Date): SchoolDayStatus {
  const iso = toISO(date);
  const dow = date.getDay(); // 0 = Sun, 6 = Sat

  if (dow === 0 || dow === 6) return { blocked: true, label: null }; // weekend

  if (iso < SCHOOL_YEAR.firstDay || iso > SCHOOL_YEAR.lastDay) {
    return { blocked: true, label: 'Summer' };
  }

  for (const b of BREAKS) {
    if (inRange(iso, b)) return { blocked: true, label: b.label };
  }

  return { blocked: false, label: EARLY_DISMISSAL[iso] ?? null };
}
