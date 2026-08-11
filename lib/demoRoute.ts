/**
 * Route synthesis for DEMO_MODE (see lib/demoMode). Builds a plausible drive
 * from the trip's REAL pins and interpolates a position along it, so the demo
 * shows the actual carpool geography rather than an invented one.
 *
 * Every function here is only ever called behind the DEMO_MODE flag.
 */
import type { GeoPoint, MapStop } from '@/types';
import { haversineMeters } from '@/lib/geo';

/** A fix synthesised from the route: where the car is and which way it faces. */
export interface RoutePosition {
  point: GeoPoint;
  heading: number; // degrees clockwise from north
}

function samePoint(a: GeoPoint, b: GeoPoint): boolean {
  // ~1e-6 degrees is well under a metre — anything closer is the same pin.
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
}

/**
 * Order the trip's stops into an afternoon run: school → riders → driver home.
 *
 * Riders are visited nearest-first from the current position (a greedy
 * nearest-neighbour tour). That is not the optimal route, but it looks like a
 * sensible drive and costs nothing — the real app never plans routes, so there
 * is no ordering logic to reuse here.
 *
 * Returns [] when there is nothing sensible to drive (fewer than two distinct
 * points), which makes the whole demo path inert rather than degenerate.
 */
export function buildDemoRoute(stops: MapStop[], driverHome: GeoPoint | null): GeoPoint[] {
  const school = stops.find((s) => s.kind === 'school')?.point;
  const home = driverHome ?? stops.find((s) => s.kind === 'driver')?.point ?? null;
  const riders = stops.filter((s) => s.kind === 'rider').map((s) => s.point);

  const origin = school ?? home;
  if (!origin) return [];

  const route: GeoPoint[] = [origin];
  const remaining = [...riders];
  let at = origin;
  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (haversineMeters(at, remaining[i]) < haversineMeters(at, remaining[best])) best = i;
    }
    at = remaining.splice(best, 1)[0];
    route.push(at);
  }
  if (home) route.push(home);

  // Collapse consecutive duplicates (e.g. the driver's home is also a pin).
  const deduped = route.filter((p, i) => i === 0 || !samePoint(p, route[i - 1]));
  return deduped.length >= 2 ? deduped : [];
}

/** Initial bearing from `a` to `b`, degrees clockwise from north. */
function bearing(a: GeoPoint, b: GeoPoint): number {
  const toRad = Math.PI / 180;
  const dLng = (b.lng - a.lng) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

/**
 * Position at fraction `f` (0…1) of the way along `route`, by distance.
 *
 * Interpolation is linear in lat/lng within a segment. Over a few kilometres
 * that is visually indistinguishable from a great circle, and the car follows
 * straight lines between pins rather than roads — an honest demo artifact, since
 * road-snapping would need a Directions API key the project doesn't have.
 */
export function pointAlong(route: GeoPoint[], f: number): RoutePosition | null {
  if (route.length < 2) return null;

  const legs: number[] = [];
  let total = 0;
  for (let i = 1; i < route.length; i += 1) {
    const d = haversineMeters(route[i - 1], route[i]);
    legs.push(d);
    total += d;
  }
  if (total === 0) return null;

  const target = Math.min(Math.max(f, 0), 1) * total;
  let travelled = 0;
  for (let i = 0; i < legs.length; i += 1) {
    if (travelled + legs[i] >= target || i === legs.length - 1) {
      const a = route[i];
      const b = route[i + 1];
      const t = legs[i] === 0 ? 0 : Math.min((target - travelled) / legs[i], 1);
      return {
        point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        heading: bearing(a, b),
      };
    }
    travelled += legs[i];
  }
  return null;
}
