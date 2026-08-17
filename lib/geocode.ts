import type { GeoPoint } from '@/types';
import { DEMO_MODE } from '@/lib/demoMode';
import { DEMO_SIGNUP_PREFILL } from '@/lib/demo/fixtures';

export interface AddressSuggestion {
  /** Full human-readable address, e.g. "123 Main St, Sunnyvale, CA, USA". */
  label: string;
  lat: number;
  lng: number;
}

/**
 * Free worldwide address autocomplete via OpenStreetMap Nominatim. Returns up to
 * `limit` real address matches for what the user has typed so far. No API key,
 * no billing. Nominatim asks for at most ~1 req/sec — callers MUST debounce.
 * Always returns [] on any failure so the field degrades to a plain text box.
 *
 * In demo mode this never leaves the device: the address field is prefilled from
 * the fixtures, so a per-keystroke Nominatim call would only be a network leak on
 * stage (risk R4). The autocomplete degrades to a plain text box.
 */
export async function searchAddresses(
  query: string,
  limit = 5,
): Promise<AddressSuggestion[]> {
  if (DEMO_MODE) return [];
  const q = query.trim();
  if (q.length < 4) return [];
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=' +
      limit +
      '&q=' +
      encodeURIComponent(q);
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Ridr/1.0 (carpool app)',
      },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    const out: AddressSuggestion[] = [];
    for (const row of data) {
      const r = row as { display_name?: string; lat?: string; lon?: string };
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!r.display_name || Number.isNaN(lat) || Number.isNaN(lng)) continue;
      out.push({ label: r.display_name, lat, lng });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Free address -> lat/lng geocoding via OpenStreetMap Nominatim.
 *
 * No API key, no billing. Nominatim's usage policy asks for a descriptive
 * User-Agent/Referer and at most ~1 request/second — fine for our one-off
 * geocode at signup / when a parent edits their address. Always returns null on
 * any failure so the caller can store a null location and carry on (the map
 * simply won't pin that home).
 *
 * In demo mode this resolves to the presenter's fixture coordinates without
 * touching the network (risk R4). Signup already prefills `addressCoords` so this
 * call is normally short-circuited before it happens; this is the belt-and-braces
 * half, and it also keeps Edit Profile's blocking geocode from failing the save
 * when there is no network on stage.
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  // Demo mode cannot geocode — Nominatim is a network call, and the whole point
  // is that the demo runs without one. Every non-empty address therefore
  // resolves to the demo home.
  //
  // The empty check still runs first, and deliberately so: returning coordinates
  // for '' would let EditProfileScreen save a blank address (it only blocks when
  // geocoding returns null), quietly destroying the one field the whole pairing
  // engine depends on. Resolving a *wrong* address to the demo home is a
  // cosmetic lie; resolving an *empty* one is a broken screen.
  //
  // Not narrowed to the exact fixture address on purpose: that would make any
  // hand-edit of the address field a hard signup failure, and this runs on
  // stage. Cosmetically wrong beats a dead submit button.
  if (DEMO_MODE) {
    return address.trim() ? { ...DEMO_SIGNUP_PREFILL.coords } : null;
  }
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
        'User-Agent': 'Ridr/1.0 (carpool app)',
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
