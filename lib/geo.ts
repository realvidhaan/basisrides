import type { GeoPoint } from '@/types';

/**
 * Great-circle (haversine) distance between two lat/lng points, in meters.
 * Shared by the trip geofencing (useTripGeofencing / lib/geofenceTask) and the
 * carpool impact calculation.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2);
  const sb = Math.sin(dLng / 2);
  const c =
    sa * sa +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sb *
      sb;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}
