import type { GeoPoint } from '@/types';

/**
 * Free address -> lat/lng geocoding via OpenStreetMap Nominatim.
 *
 * No API key, no billing. Nominatim's usage policy asks for a descriptive
 * User-Agent/Referer and at most ~1 request/second — fine for our one-off
 * geocode at signup / when a parent edits their address. Always returns null on
 * any failure so the caller can store a null location and carry on (the map
 * simply won't pin that home).
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = address.trim();
  if (!query) return null;
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Identify the app per Nominatim policy.
        'User-Agent': 'BasisRide/1.0 (carpool app)',
      },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0] as { lat?: string; lon?: string };
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
