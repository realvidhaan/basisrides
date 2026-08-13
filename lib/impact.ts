import { haversineMeters } from '@/lib/geo';
import { SCHOOL } from '@/lib/places';
import type { GeoPoint } from '@/types';

/**
 * Carpool impact — the arithmetic behind the strip at the top of Schedule.
 *
 * Pure and dependency-free on purpose: the numbers are a claim we make to
 * parents, so they have to be inspectable and unit-testable without a Supabase
 * client, a React tree or a device.
 */

/**
 * EPA's tailpipe figure for a typical passenger vehicle: 404 g CO₂ per mile.
 * https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle
 */
export const CO2_KG_PER_MILE = 0.404;

/** International mile. haversineMeters returns meters; the strip reports miles. */
const METERS_PER_MILE = 1609.344;

/** The two columns of `trips` the calculation needs. */
export interface ImpactTrip {
  driver_id: string;
  rider_ids: string[] | null;
}

export interface ImpactTotals {
  /** Miles of driving the carpool removed from the road. */
  milesSaved: number;
  /** Those miles priced in kilograms of CO₂. */
  co2KgAvoided: number;
  /** Completed rides in which at least one rider shared the driver's car. */
  ridesShared: number;
}

export const EMPTY_IMPACT: ImpactTotals = {
  milesSaved: 0,
  co2KgAvoided: 0,
  ridesShared: 0,
};

/**
 * The riders a trip actually carried, deduplicated and never counting the
 * driver. `rider_ids` is a plain text[] with no constraint behind it, so a
 * driver who was also listed as their own rider would otherwise be credited
 * with saving the trip they personally drove.
 */
export function ridersOf(trip: ImpactTrip): string[] {
  const riders = new Set(trip.rider_ids ?? []);
  riders.delete(trip.driver_id);
  return Array.from(riders);
}

/** Whether `userId` was in this car at all — as the driver or as a rider. */
export function isParticipant(trip: ImpactTrip, userId: string): boolean {
  return trip.driver_id === userId || ridersOf(trip).includes(userId);
}

/**
 * Totals across the completed trips `participantId` was part of.
 *
 * The model: every rider in the car is one household that did not drive to
 * campus and back, so each rider saves 2 × (their home → school). We measure
 * from the rider's saved home coordinates rather than the driven route because
 * what is avoided is the trip they would have made alone, not the detour the
 * carpool actually took. A rider with no coordinates on file contributes zero
 * miles rather than an invented average — under-reporting is the honest failure
 * direction for a number a parent might quote.
 *
 * @param trips        completed trips only; callers filter on status.
 * @param homeById     rider id → home coordinates, for riders we know.
 * @param participantId the viewer; null (signed out, or still loading) is zero.
 */
export function computeImpact(
  trips: readonly ImpactTrip[],
  homeById: ReadonlyMap<string, GeoPoint>,
  participantId: string | null,
): ImpactTotals {
  if (!participantId) return EMPTY_IMPACT;

  let milesSaved = 0;
  let ridesShared = 0;

  for (const trip of trips) {
    const riders = ridersOf(trip);
    // A drive with nobody aboard shared nothing and saved nothing. It can happen
    // legitimately: every rider skipped the day after the trip row was created.
    if (riders.length === 0) continue;
    if (trip.driver_id !== participantId && !riders.includes(participantId)) continue;

    ridesShared += 1;
    for (const riderId of riders) {
      const home = homeById.get(riderId);
      if (!home) continue;
      milesSaved += (2 * haversineMeters(home, SCHOOL.point)) / METERS_PER_MILE;
    }
  }

  return { milesSaved, co2KgAvoided: milesSaved * CO2_KG_PER_MILE, ridesShared };
}
