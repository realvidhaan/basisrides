/**
 * Live-location plumbing shared by the driver (publisher) and the map
 * (subscriber). The driver's app broadcasts GPS fixes on a per-trip Supabase
 * Realtime channel; the embedded Leaflet map subscribes to the same channel and
 * animates the car. Broadcast is ephemeral (nothing is written to the DB), so
 * there's no location history to clean up.
 */

export const LOC_EVENT = 'loc';

export interface LocPayload {
  lat: number;
  lng: number;
  heading: number | null; // degrees clockwise from north, if the device knows
}

/** Channel name for a single driver's trip on a given date. */
export function tripLocChannel(driverId: string, iso: string): string {
  return `trip-loc-${driverId}-${iso}`;
}
