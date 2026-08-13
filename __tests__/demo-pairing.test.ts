/**
 * Demo mode — the pairing invariant, exhaustively.
 *
 * Two claims are made on stage, and the whole demo collapses if either is
 * false for the value the presenter happens to tap:
 *
 *   1. one car, three riders, nobody unmatched — for EVERY pickup time the
 *      clock can produce (`docs/demo-architecture.md §6.4`);
 *   2. the driver is the presenter when "I can drive" is ticked and Jenna when
 *      it is not — INDEPENDENT of the date (§7).
 *
 * Claim 2 is the interesting one. `driveCount` in `lib/pairing.ts:242` is
 * cumulative across the whole season, so two willing drivers on the same
 * weekday alternate day by day (§7.1) and "who drives next" becomes a coin
 * flip. `store.companionAvailability` fixes that by coupling Jenna's
 * `can_drive` to the inverse of the presenter's — which only works if it holds
 * on every date, so this suite proves it on four, including a Monday and a
 * Friday and one deep enough into the season for the counts to be large.
 *
 * Nothing here is sampled and nothing is re-implemented: the assertions run
 * against the real `lib/pairing.ts` over participants read back through the
 * real embedded-join query `hooks/useCarpool.ts:91-95` issues.
 */
import { toISO } from '@/lib/dateUtils';
import { createDemoClient } from '@/lib/demo/client';
import { JENNA_ID, MARCUS_ID, PRESENTER_ID, PRIYA_ID } from '@/lib/demo/fixtures';
import { __resetStore, type DemoTable, type Row } from '@/lib/demo/store';
import { createRotationEngine, type Participant, type UserAssignment } from '@/lib/pairing';
import { isEarlyDismissal, schoolDayStatus } from '@/lib/schoolCalendar';
import { cityZone } from '@/lib/zones';
import type { WeekdayKey } from '@/types';

// ---------------------------------------------------------------------------
// Client plumbing (see __tests__/demo-store.test.ts for why this is structural)
// ---------------------------------------------------------------------------

interface DemoResult {
  data: Row[] | null;
  error: { code: string; message: string } | null;
}

interface Builder extends PromiseLike<DemoResult> {
  select(spec?: string): Builder;
  upsert(values: Row | Row[], opts?: { onConflict?: string }): Builder;
  eq(column: string, value: unknown): Builder;
}

interface DemoClient {
  from(table: DemoTable): Builder;
}

/** The exact select string from `hooks/useCarpool.ts:91-95`. */
const AVAILABILITY_SELECT =
  'user_id, day_of_week, dismissal_time, can_drive,' +
  ' user:users!availability_user_id_fkey(full_name,neighborhood,car_capacity,' +
  'car_color,car_type,car_model,license_plate,address)';

const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/**
 * Every pickup time `components/ui/TimePickerClock.tsx` can emit.
 *
 * Mirrors HOURS_12 (`:19`), MINUTES (`:20`) and minuteOptionsForHour (`:30-34`),
 * which drops 3:00 (before the 3:15 minimum) and allows only 6:00 in the six
 * o'clock hour. Re-derived rather than hard-coded so a widened window here
 * fails the count assertion below instead of silently going untested.
 */
function clockValues(): string[] {
  const out: string[] = [];
  for (const h12 of [3, 4, 5, 6]) {
    const minutes = h12 === 3 ? [15, 30, 45] : h12 === 6 ? [0] : [0, 15, 30, 45];
    for (const m of minutes) out.push(`${h12 + 12}:${m < 10 ? `0${m}` : m}`);
  }
  return out;
}

const CLOCK_VALUES = clockValues();

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + delta;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh < 10 ? `0${hh}` : hh}:${mm < 10 ? `0${mm}` : mm}`;
}

/**
 * Store the presenter's schedule, then read the community back the way the
 * Schedule screen does. Returns exactly what `useCarpool` would hand the engine.
 */
async function communityFor(time: string, canDrive: boolean): Promise<Participant[]> {
  __resetStore();
  const db = createDemoClient() as DemoClient;

  await db.from('availability').upsert(
    WEEKDAYS.map((day) => ({
      user_id: PRESENTER_ID,
      day_of_week: day,
      participating: true,
      dismissal_time: `${time}:00`,
      can_drive: canDrive,
      is_driving: false,
      role: 'ride',
    })),
    { onConflict: 'user_id,day_of_week' },
  );

  const res = await db.from('availability').select(AVAILABILITY_SELECT).eq('participating', true);
  expect(res.error).toBeNull();

  const out: Participant[] = [];
  for (const row of res.data ?? []) {
    const user = row.user as Row | null;
    // useCarpool.ts:131 — a row whose embed did not hydrate is dropped, which
    // is how the Schedule screen goes blank with no error at all.
    if (!user || !row.dismissal_time) continue;
    out.push({
      userId: String(row.user_id),
      name: String(user.full_name),
      weekday: row.day_of_week as WeekdayKey,
      time: String(row.dismissal_time).slice(0, 5),
      zone: cityZone(String(user.neighborhood)),
      capacity: Number(user.car_capacity),
      canDrive: Boolean(row.can_drive),
      car: {
        color: (user.car_color as string | null) ?? null,
        type: (user.car_type as string | null) ?? null,
        model: (user.car_model as string | null) ?? null,
        plate: (user.license_plate as string | null) ?? null,
      },
      address: (user.address as string | null) ?? null,
    });
  }
  return out;
}

async function assignmentFor(
  time: string,
  canDrive: boolean,
  date: Date,
): Promise<UserAssignment | undefined> {
  const participants = await communityFor(time, canDrive);
  return createRotationEngine(participants).assignmentsFor(date).get(PRESENTER_ID);
}

/**
 * Four ordinary school days. A Monday and a Friday are both present because the
 * generated availability is per-weekday, and 2027-01-11 sits ~100 school days
 * into the season so `driveCount` is well past the point where a tie-break
 * could be doing the work.
 */
const DATES: { label: string; date: Date }[] = [
  { label: 'Mon 2026-08-17', date: new Date(2026, 7, 17) },
  { label: 'Fri 2026-08-21', date: new Date(2026, 7, 21) },
  { label: 'Wed 2026-11-04', date: new Date(2026, 10, 4) },
  { label: 'Mon 2027-01-11 (deep in the season)', date: new Date(2027, 0, 11) },
];

// ---------------------------------------------------------------------------

describe('the clock’s value set', () => {
  it('is the twelve values §6.4 reasons about', () => {
    expect(CLOCK_VALUES).toEqual([
      '15:15',
      '15:30',
      '15:45',
      '16:00',
      '16:15',
      '16:30',
      '16:45',
      '17:00',
      '17:15',
      '17:30',
      '17:45',
      '18:00',
    ]);
  });
});

describe('the four test dates', () => {
  it.each(DATES)('$label is an ordinary, non-early-dismissal school day', ({ date }) => {
    // If the published calendar ever changes, this fails here rather than
    // making the pickup-time assertions below mysteriously wrong (R12).
    expect(schoolDayStatus(date).blocked).toBe(false);
    expect(isEarlyDismissal(date)).toBe(false);
    expect(date.getDay()).toBeGreaterThanOrEqual(1);
    expect(date.getDay()).toBeLessThanOrEqual(5);
  });

  it('covers a Monday and a Friday', () => {
    const days = DATES.map((d) => d.date.getDay());
    expect(days).toContain(1);
    expect(days).toContain(5);
  });
});

describe.each(DATES)('presenter assignment on $label', ({ date }) => {
  const cases = CLOCK_VALUES.flatMap((time) =>
    [true, false].map((canDrive) => ({ time, canDrive })),
  );

  it.each(cases)(
    'pickup $time, can_drive $canDrive → one car, three riders, deterministic driver',
    async ({ time, canDrive }) => {
      const assignment = await assignmentFor(time, canDrive, date);

      // §6.4: the four cluster members span b .. b+15, inside the 30-minute
      // window, so the cluster never splits and nobody is left without a car.
      expect(assignment).toBeDefined();
      const a = assignment as UserAssignment;
      expect(a.role).not.toBe('unmatched');
      expect(a.driver).not.toBeNull();
      expect(a.riders).toHaveLength(3);
      expect(a.zone).toBe('San Jose');
      expect(a.time).toBe(addMinutes(time, 15));

      // §7: the driver must not depend on the date. `driveCount` is cumulative,
      // so this is the assertion the whole coupling in companionAvailability
      // exists to make true.
      if (canDrive) {
        expect(a.role).toBe('drive');
        expect(a.driver?.userId).toBe(PRESENTER_ID);
        expect(a.riders.map((r) => r.userId).sort()).toEqual(
          [MARCUS_ID, PRIYA_ID, JENNA_ID].sort(),
        );
      } else {
        expect(a.role).toBe('ride');
        expect(a.driver?.userId).toBe(JENNA_ID);
        expect(a.driver?.car).toEqual({
          color: 'blue',
          type: 'minivan',
          model: 'Toyota Sienna',
          plate: '6TRJ109',
        });
        // The rider list is the whole car, presenter included; ScheduleScreen
        // filters the viewer out for display.
        expect(a.riders.map((r) => r.userId).sort()).toEqual(
          [PRESENTER_ID, MARCUS_ID, PRIYA_ID].sort(),
        );
      }
    },
  );
});

describe('everyone in the cluster shares one car', () => {
  it.each(CLOCK_VALUES)('at pickup %s the other three ride with the presenter', async (time) => {
    const participants = await communityFor(time, true);
    const assignments = createRotationEngine(participants).assignmentsFor(DATES[0].date);
    for (const id of [MARCUS_ID, PRIYA_ID, JENNA_ID]) {
      const a = assignments.get(id);
      expect(a?.role).toBe('ride');
      expect(a?.driver?.userId).toBe(PRESENTER_ID);
      expect(a?.time).toBe(addMinutes(time, 15));
    }
  });
});

describe('the presenter who has not set a schedule yet', () => {
  it('still sees a full car at the 15:15 fallback', async () => {
    __resetStore();
    const db = createDemoClient() as DemoClient;
    const res = await db.from('availability').select(AVAILABILITY_SELECT).eq('participating', true);
    const participants: Participant[] = (res.data ?? []).map((row) => {
      const user = row.user as Row;
      return {
        userId: String(row.user_id),
        name: String(user.full_name),
        weekday: row.day_of_week as WeekdayKey,
        time: String(row.dismissal_time).slice(0, 5),
        zone: cityZone(String(user.neighborhood)),
        capacity: Number(user.car_capacity),
        canDrive: Boolean(row.can_drive),
        car: { color: null, type: null, model: null, plate: null },
        address: null,
      };
    });
    // Three companions × five weekdays, and Jenna drives because the presenter
    // is not participating at all.
    expect(participants).toHaveLength(15);
    const a = createRotationEngine(participants).assignmentsFor(DATES[0].date).get(JENNA_ID);
    expect(a?.role).toBe('drive');
    expect(a?.riders).toHaveLength(2);
    expect(a?.time).toBe('15:30'); // 15:15 fallback + 15
  });
});

// ---------------------------------------------------------------------------
// Why the coupling exists — §7.1
// ---------------------------------------------------------------------------

describe('§7.1 — the bug the coupling prevents', () => {
  it('two willing drivers on the same weekday DO alternate by date', async () => {
    // Not a property of the demo, a property of lib/pairing.ts. If this ever
    // stops being true the coupling in companionAvailability is dead weight —
    // and if the coupling is ever removed, this is what the demo would do.
    const base = await communityFor('15:15', true);
    const bothDrive = base.map((p) =>
      p.userId === JENNA_ID ? { ...p, canDrive: true } : p,
    );

    const engine = createRotationEngine(bothDrive);
    const drivers = new Set<string>();
    const cursor = new Date(2026, 7, 12);
    for (let i = 0; i < 14; i += 1) {
      if (!schoolDayStatus(cursor).blocked) {
        const a = engine.assignmentsFor(new Date(cursor)).get(PRESENTER_ID);
        if (a) drivers.add(a.role === 'drive' ? PRESENTER_ID : String(a.driver?.userId));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    expect(drivers).toEqual(new Set([PRESENTER_ID, JENNA_ID]));
  });

  it('but the coupled community never alternates, over a whole month of dates', async () => {
    for (const canDrive of [true, false]) {
      const participants = await communityFor('15:15', canDrive);
      const engine = createRotationEngine(participants);
      const drivers = new Set<string>();
      const cursor = new Date(2026, 7, 12);
      for (let i = 0; i < 31; i += 1) {
        if (!schoolDayStatus(cursor).blocked) {
          const a = engine.assignmentsFor(new Date(cursor)).get(PRESENTER_ID);
          if (a) drivers.add(String(a.driver?.userId));
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      expect(drivers).toEqual(new Set([canDrive ? PRESENTER_ID : JENNA_ID]));
    }
  });

  it('the generated companions always sit inside the 30-minute window (§6.4)', async () => {
    for (const time of CLOCK_VALUES) {
      const participants = await communityFor(time, true);
      const monday = participants.filter((p) => p.weekday === 'mon');
      expect(monday).toHaveLength(4);
      const minutes = monday.map((p) => {
        const [h, m] = p.time.split(':').map(Number);
        return h * 60 + m;
      });
      expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(30);
    }
  });

  it('never emits a generated row under the presenter’s id (Edit Schedule reads .eq(user_id))', async () => {
    const participants = await communityFor('16:30', false);
    const mondayPresenter = participants.filter(
      (p) => p.weekday === 'mon' && p.userId === PRESENTER_ID,
    );
    expect(mondayPresenter).toHaveLength(1);
    expect(mondayPresenter[0].time).toBe('16:30');
  });
});

describe('dateUtils sanity for the dates above', () => {
  it('toISO agrees with the labels', () => {
    expect(DATES.map((d) => toISO(d.date))).toEqual([
      '2026-08-17',
      '2026-08-21',
      '2026-11-04',
      '2027-01-11',
    ]);
  });
});
