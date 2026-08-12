/**
 * Traversal helpers for the hardcoded demo route (see lib/demoRouteData).
 *
 * Everything here is only ever reached behind the DEMO_MODE flag.
 */
import type { GeoPoint } from '@/types';
import { DEMO_ROUTE } from '@/lib/demoRouteData';

export interface RoutePosition {
  point: GeoPoint;
  heading: number; // degrees clockwise from north
  index: number; // last route vertex passed — where to split the polyline
}

/**
 * Equirectangular approximation, scaled for this latitude. Over a 12 km city
 * route the error against haversine is centimetres, and it is called for every
 * vertex at module load, so the cheap form is the right one.
 *
 * Declared before CUMULATIVE deliberately: that table is built by an IIFE at
 * module load, and hoisting is the only reason a later declaration would work.
 * Converting this to a const arrow function would then throw at import time.
 */
function flatMetres(a: GeoPoint, b: GeoPoint): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = mPerDegLat * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * mPerDegLat;
  const dx = (b.lng - a.lng) * mPerDegLng;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Cumulative distance to each vertex, in metres, computed once.
 *
 * Progress is mapped through THIS table rather than through vertex count.
 * Road polylines have wildly uneven vertex spacing — dense through turns,
 * sparse along a straight expressway — so stepping per vertex makes the car
 * crawl through corners and rocket down straights. Interpolating by distance
 * is what makes the speed read as constant.
 */
const CUMULATIVE: number[] = (() => {
  const out = [0];
  let total = 0;
  for (let i = 1; i < DEMO_ROUTE.length; i += 1) {
    total += flatMetres(DEMO_ROUTE[i - 1], DEMO_ROUTE[i]);
    out.push(total);
  }
  return out;
})();

const TOTAL_METRES = CUMULATIVE[CUMULATIVE.length - 1];

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

/** Binary search for the last vertex at or before `metres`. */
function vertexAt(metres: number): number {
  let lo = 0;
  let hi = CUMULATIVE.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (CUMULATIVE[mid] <= metres) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Position at fraction `f` (0…1) of the way along the route, BY DISTANCE.
 *
 * Heading is taken from the segment being travelled, and near a vertex is
 * blended with the next segment's bearing so the car turns through a corner
 * instead of snapping to the new bearing in one frame.
 */
export function positionAt(f: number): RoutePosition {
  const clamped = Math.min(Math.max(f, 0), 1);
  const target = clamped * TOTAL_METRES;
  const i = vertexAt(target);

  if (i >= DEMO_ROUTE.length - 1) {
    const last = DEMO_ROUTE.length - 1;
    return {
      point: DEMO_ROUTE[last],
      heading: bearing(DEMO_ROUTE[last - 1], DEMO_ROUTE[last]),
      index: last,
    };
  }

  const a = DEMO_ROUTE[i];
  const b = DEMO_ROUTE[i + 1];
  const segment = CUMULATIVE[i + 1] - CUMULATIVE[i];
  const t = segment === 0 ? 0 : (target - CUMULATIVE[i]) / segment;

  const here = bearing(a, b);
  // Blend into the next segment's bearing over the last 30% of this one.
  const next = i + 2 < DEMO_ROUTE.length ? bearing(b, DEMO_ROUTE[i + 2]) : here;
  const blend = t > 0.7 ? (t - 0.7) / 0.3 : 0;
  const delta = ((next - here + 540) % 360) - 180; // shortest way round
  const heading = (here + delta * blend + 360) % 360;

  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    heading,
    index: i,
  };
}

export { DEMO_ROUTE };
export { DEMO_STOPS, type DemoStop } from '@/lib/demoRouteData';
