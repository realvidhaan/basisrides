import type { GeoPoint } from '@/types';

/**
 * The campus every morning/afternoon carpool converges on — the shared
 * destination for matching, geofencing and the impact calculation.
 *
 * One community, one campus: a deployment serves a single school, so this is a
 * constant rather than a per-user lookup. Point it at the campus you are
 * deploying for; `name` is user-visible on the live-trip map.
 */
export const SCHOOL: { name: string; point: GeoPoint } = {
  name: 'School',
  point: { lat: 37.3197, lng: -121.912 },
};
