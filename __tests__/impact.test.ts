/**
 * `lib/impact.ts` — the arithmetic behind the carpool impact strip.
 *
 * These numbers are a claim the app makes to parents ("you saved 41 miles"), so
 * they are pinned against values derived independently of the implementation:
 * the distance cases use the closed form for a pure-latitude offset
 * (`R · Δφ`) rather than calling `haversineMeters`, which is the function under
 * test's own dependency.
 *
 * The honest-failure rule is asserted explicitly: a rider whose home
 * coordinates are missing contributes ZERO miles, never an average, because
 * under-reporting is the only safe direction for a figure a parent might quote.
 */
import { DEMO_USERS, PRESENTER_ID, SEED_TABLES } from '@/lib/demo/fixtures';
import {
  CO2_KG_PER_MILE,
  EMPTY_IMPACT,
  computeImpact,
  isParticipant,
  ridersOf,
  type ImpactTrip,
} from '@/lib/impact';
import { SCHOOL } from '@/lib/places';
import type { GeoPoint } from '@/types';

const ME = 'me';
const RIDER_A = 'rider-a';
const RIDER_B = 'rider-b';
const STRANGER = 'stranger';

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_MILE = 1609.344;

/** A point exactly `deg` degrees of latitude north of the school. */
function northOfSchool(deg: number): GeoPoint {
  return { lat: SCHOOL.point.lat + deg, lng: SCHOOL.point.lng };
}

/**
 * Round-trip miles for a home `deg` degrees of latitude from school.
 *
 * Along a meridian the great-circle distance is exactly `R · Δφ`, so this needs
 * no haversine — which is what makes it an independent check rather than a
 * restatement of the implementation.
 */
function roundTripMiles(deg: number): number {
  return (2 * EARTH_RADIUS_M * ((deg * Math.PI) / 180)) / METERS_PER_MILE;
}

function homes(entries: [string, GeoPoint][]): Map<string, GeoPoint> {
  return new Map(entries);
}

describe('ridersOf', () => {
  it('drops the driver from their own rider list', () => {
    // `rider_ids` is a bare text[] with no constraint behind it, so a driver
    // listed as their own rider would otherwise be credited with the trip they
    // personally drove.
    expect(ridersOf({ driver_id: ME, rider_ids: [ME, RIDER_A] })).toEqual([RIDER_A]);
  });

  it('deduplicates and tolerates a null column', () => {
    expect(ridersOf({ driver_id: ME, rider_ids: [RIDER_A, RIDER_A, RIDER_B] })).toEqual([
      RIDER_A,
      RIDER_B,
    ]);
    expect(ridersOf({ driver_id: ME, rider_ids: null })).toEqual([]);
  });
});

describe('isParticipant', () => {
  const trip: ImpactTrip = { driver_id: ME, rider_ids: [RIDER_A] };
  it('is true for the driver and for a rider, false for anyone else', () => {
    expect(isParticipant(trip, ME)).toBe(true);
    expect(isParticipant(trip, RIDER_A)).toBe(true);
    expect(isParticipant(trip, STRANGER)).toBe(false);
  });
});

describe('computeImpact — known coordinates give known miles', () => {
  it('credits one rider with two legs of their own home→school distance', () => {
    const trips: ImpactTrip[] = [{ driver_id: ME, rider_ids: [RIDER_A] }];
    const totals = computeImpact(trips, homes([[RIDER_A, northOfSchool(0.1)]]), ME);

    const expected = roundTripMiles(0.1);
    expect(expected).toBeCloseTo(13.8187, 3); // ~11.1 km each way
    expect(totals.milesSaved).toBeCloseTo(expected, 6);
    expect(totals.ridesShared).toBe(1);
  });

  it('adds a leg per rider, not per trip', () => {
    const trips: ImpactTrip[] = [{ driver_id: ME, rider_ids: [RIDER_A, RIDER_B] }];
    const totals = computeImpact(
      trips,
      homes([
        [RIDER_A, northOfSchool(0.1)],
        [RIDER_B, northOfSchool(0.05)],
      ]),
      ME,
    );
    expect(totals.milesSaved).toBeCloseTo(roundTripMiles(0.1) + roundTripMiles(0.05), 6);
    expect(totals.ridesShared).toBe(1);
  });

  it('accumulates across trips', () => {
    const trips: ImpactTrip[] = [
      { driver_id: ME, rider_ids: [RIDER_A] },
      { driver_id: RIDER_A, rider_ids: [ME] },
    ];
    const totals = computeImpact(
      trips,
      homes([
        [RIDER_A, northOfSchool(0.1)],
        [ME, northOfSchool(0.2)],
      ]),
      ME,
    );
    expect(totals.milesSaved).toBeCloseTo(roundTripMiles(0.1) + roundTripMiles(0.2), 6);
    expect(totals.ridesShared).toBe(2);
  });

  it('is zero miles for a rider who lives at the school', () => {
    const totals = computeImpact(
      [{ driver_id: ME, rider_ids: [RIDER_A] }],
      homes([[RIDER_A, SCHOOL.point]]),
      ME,
    );
    expect(totals.milesSaved).toBe(0);
    expect(totals.ridesShared).toBe(1); // the ride was still shared
  });
});

describe('computeImpact — a rider with no coordinates contributes ZERO, not an average', () => {
  it('omits the unknown rider entirely instead of imputing anything', () => {
    const trips: ImpactTrip[] = [{ driver_id: ME, rider_ids: [RIDER_A, RIDER_B] }];
    const withBoth = computeImpact(
      trips,
      homes([
        [RIDER_A, northOfSchool(0.1)],
        [RIDER_B, northOfSchool(0.1)],
      ]),
      ME,
    );
    const withOne = computeImpact(trips, homes([[RIDER_A, northOfSchool(0.1)]]), ME);

    expect(withOne.milesSaved).toBeCloseTo(roundTripMiles(0.1), 6);
    // Exactly half — i.e. the missing rider added nothing, and in particular did
    // NOT inherit the other rider's distance as an average.
    expect(withOne.milesSaved).toBeCloseTo(withBoth.milesSaved / 2, 6);
    // The ride still counts: it was genuinely shared, we just cannot price it.
    expect(withOne.ridesShared).toBe(1);
  });

  it('reports zero miles when nobody in the car has coordinates', () => {
    const totals = computeImpact(
      [{ driver_id: ME, rider_ids: [RIDER_A, RIDER_B] }],
      homes([]),
      ME,
    );
    expect(totals.milesSaved).toBe(0);
    expect(totals.co2KgAvoided).toBe(0);
    expect(totals.ridesShared).toBe(1);
  });
});

describe('computeImpact — non-participants are excluded', () => {
  it('ignores a trip the viewer was not in', () => {
    const trips: ImpactTrip[] = [{ driver_id: RIDER_A, rider_ids: [RIDER_B] }];
    const totals = computeImpact(
      trips,
      homes([
        [RIDER_A, northOfSchool(0.1)],
        [RIDER_B, northOfSchool(0.1)],
      ]),
      STRANGER,
    );
    expect(totals).toEqual(EMPTY_IMPACT);
  });

  it('counts only the viewer’s own trips out of a mixed list', () => {
    const trips: ImpactTrip[] = [
      { driver_id: ME, rider_ids: [RIDER_A] }, // mine, as driver
      { driver_id: RIDER_A, rider_ids: [ME] }, // mine, as rider
      { driver_id: RIDER_A, rider_ids: [RIDER_B] }, // not mine
      { driver_id: STRANGER, rider_ids: [RIDER_B] }, // not mine
    ];
    const homeMap = homes([
      [ME, northOfSchool(0.1)],
      [RIDER_A, northOfSchool(0.1)],
      [RIDER_B, northOfSchool(0.1)],
    ]);
    const totals = computeImpact(trips, homeMap, ME);
    expect(totals.ridesShared).toBe(2);
    expect(totals.milesSaved).toBeCloseTo(2 * roundTripMiles(0.1), 6);
  });

  it('skips a drive that carried nobody', () => {
    const trips: ImpactTrip[] = [
      { driver_id: ME, rider_ids: [] },
      { driver_id: ME, rider_ids: null },
      { driver_id: ME, rider_ids: [ME] }, // only "rider" is the driver
    ];
    expect(computeImpact(trips, homes([[ME, northOfSchool(0.1)]]), ME)).toEqual(EMPTY_IMPACT);
  });

  it('returns EMPTY_IMPACT for a null viewer (signed out, or still loading)', () => {
    const trips: ImpactTrip[] = [{ driver_id: ME, rider_ids: [RIDER_A] }];
    expect(computeImpact(trips, homes([[RIDER_A, northOfSchool(0.1)]]), null)).toEqual(
      EMPTY_IMPACT,
    );
  });

  it('returns EMPTY_IMPACT for no trips at all', () => {
    expect(computeImpact([], homes([]), ME)).toEqual(EMPTY_IMPACT);
  });
});

describe('CO₂', () => {
  it('is exactly miles × 0.404 (the EPA tailpipe figure)', () => {
    expect(CO2_KG_PER_MILE).toBe(0.404);
    const totals = computeImpact(
      [{ driver_id: ME, rider_ids: [RIDER_A] }],
      homes([[RIDER_A, northOfSchool(0.1)]]),
      ME,
    );
    expect(totals.co2KgAvoided).toBe(totals.milesSaved * 0.404);
    expect(totals.co2KgAvoided).toBeCloseTo(roundTripMiles(0.1) * 0.404, 6);
  });

  it('is zero whenever miles are zero', () => {
    expect(EMPTY_IMPACT.co2KgAvoided).toBe(0);
    expect(computeImpact([], homes([]), ME).co2KgAvoided).toBe(0);
  });
});

describe('the demo fixtures produce a non-empty strip', () => {
  it('credits the presenter with all six seeded drives', () => {
    // Guards the case the strip exists for: on the first day of the school year
    // there is no in-year history, and the fixtures deliberately reach back into
    // "Summer" days so the strip is never empty on stage.
    const trips = SEED_TABLES.trips as unknown as ImpactTrip[];
    const homeMap = new Map<string, GeoPoint>(
      DEMO_USERS.map((u) => [u.id, { lat: u.latitude, lng: u.longitude }] as [string, GeoPoint]),
    );
    const totals = computeImpact(trips, homeMap, PRESENTER_ID);

    expect(totals.ridesShared).toBe(6);
    expect(totals.milesSaved).toBeGreaterThan(0);
    expect(totals.co2KgAvoided).toBeCloseTo(totals.milesSaved * CO2_KG_PER_MILE, 9);
  });
});
