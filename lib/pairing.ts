/**
 * Deterministic, fair carpool assignment — runs identically on every client
 * over the same shared schedule data, so no server compute is needed.
 *
 * For a given date, within each (zone, 30-min time slot) group, the car-owners
 * take turns driving by week number (rotation = fairness). Chosen drivers' seats
 * are filled with the remaining members as riders; any overflow is unmatched.
 * A hardship pass removes its holder from the driver rotation for that date.
 */
import { weekIndex, weekdayKeyFromDate } from '@/lib/dateUtils';
import type { WeekdayKey } from '@/types';

export interface Participant {
  userId: string;
  name: string;
  weekday: WeekdayKey;
  time: string; // 'HH:MM'
  zone: string;
  capacity: number;
}

export interface CarMember {
  userId: string;
  name: string;
  time: string;
}

export interface UserAssignment {
  role: 'drive' | 'ride' | 'unmatched';
  zone: string;
  time: string;
  driver: CarMember | null; // the car's driver (null when unmatched)
  riders: CarMember[]; // the car's riders (excludes the driver)
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map((n) => Number(n));
  return h * 60 + m;
}

function bySortKey(a: Participant, b: Participant): number {
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

function member(p: Participant): CarMember {
  return { userId: p.userId, name: p.name, time: p.time };
}

/**
 * Computes everyone's assignment for a single date.
 * @param participants all participating parents (any weekday)
 * @param hardship set of `${userId}|${iso}` strings (driver opt-outs)
 * @param date the calendar date
 * @param iso the date's local YYYY-MM-DD (matches the hardship keys)
 */
export function computeDay(
  participants: Participant[],
  hardship: Set<string>,
  date: Date,
  iso: string,
): Map<string, UserAssignment> {
  const result = new Map<string, UserAssignment>();
  const weekday = weekdayKeyFromDate(date);
  if (!weekday) return result;

  const members = participants.filter((p) => p.weekday === weekday);

  // Group by zone + 30-minute slot.
  const groups = new Map<string, Participant[]>();
  for (const m of members) {
    const slot = Math.floor(minutes(m.time) / 30);
    const key = `${m.zone}|${slot}`;
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }

  const wk = weekIndex(date);

  for (const group of groups.values()) {
    const sorted = [...group].sort(bySortKey);
    const eligible = sorted.filter(
      (p) => p.capacity >= 1 && !hardship.has(`${p.userId}|${iso}`),
    );

    if (eligible.length === 0) {
      for (const p of sorted) {
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

    // Rotate driver order by week so turns are fair across weeks.
    const start = ((wk % eligible.length) + eligible.length) % eligible.length;
    const rotated = [...eligible.slice(start), ...eligible.slice(0, start)];

    // Choose drivers until their combined seats cover the whole group.
    const chosen: Participant[] = [];
    let seats = 0;
    for (const d of rotated) {
      if (seats >= sorted.length) break;
      chosen.push(d);
      seats += d.capacity;
    }
    const chosenIds = new Set(chosen.map((d) => d.userId));

    // Riders = everyone not chosen as a driver.
    const riders = sorted.filter((p) => !chosenIds.has(p.userId));

    // Fill each driver up to capacity-1 riders (driver's own child takes a seat).
    const riderOf = new Map<string, Participant>(); // riderId -> driver
    const carRiders = new Map<string, Participant[]>(); // driverId -> riders
    for (const d of chosen) carRiders.set(d.userId, []);
    let ri = 0;
    for (const d of chosen) {
      let free = Math.max(0, d.capacity - 1);
      while (free > 0 && ri < riders.length) {
        const r = riders[ri];
        riderOf.set(r.userId, d);
        carRiders.get(d.userId)?.push(r);
        ri += 1;
        free -= 1;
      }
    }

    // Emit assignments.
    for (const d of chosen) {
      result.set(d.userId, {
        role: 'drive',
        zone: d.zone,
        time: d.time,
        driver: member(d),
        riders: (carRiders.get(d.userId) ?? []).map(member),
      });
    }
    for (let i = 0; i < riders.length; i += 1) {
      const r = riders[i];
      const d = riderOf.get(r.userId);
      if (d) {
        result.set(r.userId, {
          role: 'ride',
          zone: r.zone,
          time: r.time,
          driver: member(d),
          riders: (carRiders.get(d.userId) ?? []).map(member),
        });
      } else {
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

  return result;
}
