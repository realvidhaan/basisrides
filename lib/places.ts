import type { GeoPoint } from '@/types';

/**
 * BASIS Independent Silicon Valley campus — the common destination for every
 * morning/afternoon carpool. Approximate coords for 1290 Parkmoor Ave, San Jose,
 * CA 95126. Edit here if the campus address ever changes.
 */
export const SCHOOL: { name: string; point: GeoPoint } = {
  name: 'BASIS Independent Silicon Valley',
  point: { lat: 37.3197, lng: -121.912 },
};
