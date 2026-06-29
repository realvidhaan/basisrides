/**
 * Deterministic, fair carpool assignment — runs identically on every client
 * over the same shared schedule data, so no server compute is needed.
 *
 * Model (Day 5):
 *  - Parents pick which weekdays they're WILLING to drive (`canDrive`). Only
 *    volunteers can be assigned to drive; everyone else rides. If nobody in a
 *    group volunteered, the whole group is "unmatched" (no car that day).
 *  - Riders are grouped per zone by a sliding 30-minute window: anyone whose
 *    pickup time is within 30 min of the group's earliest rider shares a car,
 *    picked up at the latest time in the group so every child is already out.
 *  - Among volunteer drivers, the one who has driven the FEWEST days so far
 *    this school year drives next (even-out rotation); ties break by id.
 *    This balances driving over time.
 *  - Cover requests (swap/cover system) can relieve a driver for a specific date.
 *
 * Fairness needs cumulative drive history, so assignments are produced by a
 * season engine (createRotationEngine) that walks school days in order from the
 * school-year start, carrying a running per-parent drive count. Results are
 * memoized per date, so it stays cheap and fully deterministic.
 */
import { toISO, weekdayKeyFromDate } from '@/lib/dateUtils';
import {
  EARLY_DISMISSAL_PICKUP,
  isEarlyDismissal,
  schoolDayStatus,
  schoolYearEnd,
  schoolYearStart,
} from '@/lib/schoolCalendar';
import type { WeekdayKey } from '@/types';

/** Riders within this many minutes of the earliest in a zone share a car. */
const CLUSTER_WINDOW_MIN = 30;

export interface CarInfo {
  color: string | null;
  type: string | null;
  model: string | null;
  plate: string | null;
}

export interface Participant {
  userId: string;
  name: string;
  weekday: WeekdayKey;
  time: string; // 'HH:MM' — this parent's own pickup time
  zone: string;
  capacity: number;
  canDrive: boolean; // willing to drive this weekday
  car: CarInfo; // this parent's vehicle (shown when they're the driver)
  address: string | null; // home pickup address
}

export interface CarMember {
  userId: string;
  name: string;
  time: string; // the member's own pickup time
  car: CarInfo; // the member's vehicle details
  address: string | null; // home pickup address
}

export interface UserAssignment {
  role: 'drive' | 'ride' | 'unmatched';
  zone: string;
  time: string; // the car's unified pickup time (latest in the group)
  driver: CarMember | null; // the car's driver (null when unmatched)
  riders: CarMember[]; // the car's riders (excludes the driver)
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map((n) => Number(n));
  return h * 60 + m;
}

function byTimeThenId(a: Participant, b: Participant): number {
  const ta = minutes(a.time);
  const tb = minutes(b.time);
  if (ta !== tb) return ta - tb;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

function member(p: Participant): CarMember {
  return { userId: p.userId, name: p.name, time: p.time, car: p.car, address: p.address };
}

/** Canonical (order-independent) key for a block between two users. */
export function blockKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Seats riders into the chosen drivers' cars, never placing two users with a
 * block between them in the same car (driver↔rider or rider↔rider). First-fit
 * in driver order, so with no blocks this reproduces the simple sequential
 * fill. Returns the per-car rider lists and anyone who couldn't be seated.
 */
function seatRidersBlockAware(
  chosen: Participant[],
  riders: Participant[],
  blocked: Set<string>,
): { carRiders: Map<string, Participant[]>; unseated: Participant[] } {
  const carRiders = new Map<string, Participant[]>();
  const free = new Map<string, number>();
  for (const d of chosen) {
    carRiders.set(d.userId, []);
    free.set(d.userId, Math.max(0, d.capacity - 1));
  }
  const unseated: Participant[] = [];
  for (const r of riders) {
    let placed = false;
    for (const d of chosen) {
      if ((free.get(d.userId) ?? 0) <= 0) continue;
      if (blocked.has(blockKey(r.userId, d.userId))) continue;
      const list = carRiders.get(d.userId)!;
      if (list.some((x) => blocked.has(blockKey(r.userId, x.userId)))) continue;
      list.push(r);
      free.set(d.userId, (free.get(d.userId) ?? 0) - 1);
      placed = true;
      break;
    }
    if (!placed) unseated.push(r);
  }
  return { carRiders, unseated };
}

/**
 * Computes everyone's assignment for a single date and increments `driveCount`
 * for whoever is chosen to drive (so later dates see the updated history).
 */
function computeSingleDay(
  participants: Participant[],
  skips: Set<string>,
  coverOff: Set<string>,
  coverForce: Set<string>,
  blocked: Set<string>,
  driveCount: Map<string, number>,
  date: Date,
  iso: string,
): Map<string, UserAssignment> {
  const result = new Map<string, UserAssignment>();
  const weekday = weekdayKeyFromDate(date);
  if (!weekday) return result;

  // A one-off skip means that parent's child isn't going at all that day, so
  // they're excluded from clustering entirely (neither drives nor rides).
  const members = participants.filter(
    (p) => p.weekday === weekday && !skips.has(`${p.userId}|${iso}`),
  );

  // Group by zone (same zone = close enough to share a ride).
  const byZone = new Map<string, Participant[]>();
  for (const m of members) {
    const arr = byZone.get(m.zone);
    if (arr) arr.push(m);
    else byZone.set(m.zone, [m]);
  }

  for (const zoneMembers of byZone.values()) {
    const sorted = [...zoneMembers].sort(byTimeThenId);

    // Sliding 30-minute clusters: a cluster holds everyone within
    // CLUSTER_WINDOW_MIN of its earliest member; pickup is that earliest time.
    let i = 0;
    while (i < sorted.length) {
      const anchor = sorted[i];
      const cluster: Participant[] = [anchor];
      let j = i + 1;
      while (
        j < sorted.length &&
        minutes(sorted[j].time) <= minutes(anchor.time) + CLUSTER_WINDOW_MIN
      ) {
        cluster.push(sorted[j]);
        j += 1;
      }
      i = j;

      // Pick up at the LATEST time in the cluster so every child is already
      // dismissed when the driver arrives (cluster is sorted ascending).
      const pickup = cluster[cluster.length - 1].time;

      // A cover request relieves the requester (coverOff) and signs the
      // accepter up to drive that date (coverForce) even if they hadn't
      // volunteered that weekday.
      const candidates = cluster.filter(
        (p) =>
          p.capacity >= 1 &&
          !coverOff.has(`${p.userId}|${iso}`) &&
          (p.canDrive || coverForce.has(`${p.userId}|${iso}`)),
      );

      // Nobody volunteered to drive — the whole cluster goes without a car.
      if (candidates.length === 0) {
        for (const p of cluster) {
          result.set(p.userId, {
            role: 'unmatched',
            zone: p.zone,
            time: p.time,
            driver: null,
            riders: [],
          });
        }
        continue;
      }

      // Even-out rotation: cover acceptors first, then fewest drives, then id.
      const ordered = [...candidates].sort((a, b) => {
        const fa = coverForce.has(`${a.userId}|${iso}`) ? 0 : 1;
        const fb = coverForce.has(`${b.userId}|${iso}`) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const da = driveCount.get(a.userId) ?? 0;
        const db = driveCount.get(b.userId) ?? 0;
        if (da !== db) return da - db;
        return a.userId < b.userId ? -1 : 1;
      });

      // Choose as few drivers as needed to seat the whole cluster, then seat
      // riders block-aware. A block can strand a rider even when raw capacity
      // exists (every available car has someone they're blocked with), so if
      // anyone is left unseated we pull in additional volunteer drivers — when
      // any remain — until everyone fits or the candidates run out.
      const chosen: Participant[] = [];
      let ci = 0;
      let seats = 0;
      while (ci < ordered.length && seats < cluster.length) {
        chosen.push(ordered[ci]);
        seats += ordered[ci].capacity;
        ci += 1;
      }

      let riders = cluster.filter((p) => !chosen.some((d) => d.userId === p.userId));
      let seating = seatRidersBlockAware(chosen, riders, blocked);
      while (seating.unseated.length > 0 && ci < ordered.length) {
        chosen.push(ordered[ci]);
        ci += 1;
        riders = cluster.filter((p) => !chosen.some((d) => d.userId === p.userId));
        seating = seatRidersBlockAware(chosen, riders, blocked);
      }
      const carRiders = seating.carRiders;

      // Emit drivers (and bump their season drive count).
      for (const d of chosen) {
        driveCount.set(d.userId, (driveCount.get(d.userId) ?? 0) + 1);
        result.set(d.userId, {
          role: 'drive',
          zone: d.zone,
          time: pickup,
          driver: member(d),
          riders: (carRiders.get(d.userId) ?? []).map(member),
        });
      }

      // Emit seated riders.
      const seatedRiderIds = new Set<string>();
      for (const d of chosen) {
        const list = carRiders.get(d.userId) ?? [];
        for (const r of list) {
          seatedRiderIds.add(r.userId);
          result.set(r.userId, {
            role: 'ride',
            zone: r.zone,
            time: pickup,
            driver: member(d),
            riders: list.map(member),
          });
        }
      }

      // Anyone who couldn't be seated (capacity or an unavoidable block) is
      // unmatched for the day.
      for (const r of riders) {
        if (!seatedRiderIds.has(r.userId)) {
          result.set(r.userId, {
            role: 'unmatched',
            zone: r.zone,
            time: r.time,
            driver: null,
            riders: [],
          });
        }
      }
    }
  }

  // Early dismissal: school lets out at 1:00 PM, so every pickup time that day
  // is forced to 1:00 PM regardless of each parent's normally-set time. Car
  // groupings and the driver rotation are unchanged — only the time shifts.
  if (isEarlyDismissal(date)) {
    const withTime = (m: CarMember): CarMember => ({
      ...m,
      time: EARLY_DISMISSAL_PICKUP,
    });
    for (const a of result.values()) {
      a.time = EARLY_DISMISSAL_PICKUP;
      a.driver = a.driver ? withTime(a.driver) : null;
      a.riders = a.riders.map(withTime);
    }
  }

  return result;
}

export interface RotationEngine {
  /** Everyone's assignment for a date (empty map outside the school year). */
  assignmentsFor: (date: Date) => Map<string, UserAssignment>;
}

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Builds a memoized engine that walks school days from the school-year start,
 * carrying cumulative drive counts so the "even-out" rotation is fair and
 * identical on every client. Recreate it whenever schedules/passes change.
 */
export function createRotationEngine(
  participants: Participant[],
  skips: Set<string> = new Set(),
  coverOff: Set<string> = new Set(),
  coverForce: Set<string> = new Set(),
  blocked: Set<string> = new Set(),
): RotationEngine {
  const driveCount = new Map<string, number>();
  const cache = new Map<string, Map<string, UserAssignment>>();

  const start = atMidnight(schoolYearStart());
  const end = atMidnight(schoolYearEnd());
  let cursor = new Date(start); // next day to process

  function processThrough(target: Date): void {
    const cap = target.getTime() < end.getTime() ? target : end;
    while (cursor.getTime() <= cap.getTime()) {
      const iso = toISO(cursor);
      if (schoolDayStatus(cursor).blocked) {
        cache.set(iso, new Map());
      } else {
        cache.set(
          iso,
          computeSingleDay(
            participants,
            skips,
            coverOff,
            coverForce,
            blocked,
            driveCount,
            new Date(cursor),
            iso,
          ),
        );
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return {
    assignmentsFor(date: Date): Map<string, UserAssignment> {
      const d = atMidnight(date);
      if (d.getTime() < start.getTime() || d.getTime() > end.getTime()) {
        return new Map();
      }
      processThrough(d);
      return cache.get(toISO(d)) ?? new Map();
    },
  };
}
