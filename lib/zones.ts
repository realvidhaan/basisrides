/**
 * Client-side mirror of the SQL `city_zone()` function so the UI can show a
 * parent's carpool zone. Keep in sync with the day3_city_zone migration.
 * Same zone = "close enough" to be paired together.
 */

const ZONE_MAP: Record<string, string> = {
  'palo alto': 'Peninsula',
  'menlo park': 'Peninsula',
  'los altos': 'Peninsula',
  'mountain view': 'Peninsula',
  cupertino: 'West Valley',
  sunnyvale: 'West Valley',
  'santa clara': 'West Valley',
  saratoga: 'West Valley',
  campbell: 'West Valley',
  'los gatos': 'West Valley',
  'san jose': 'San Jose',
  milpitas: 'San Jose',
  fremont: 'East Bay',
  newark: 'East Bay',
  'union city': 'East Bay',
  'morgan hill': 'South',
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function cityZone(city: string): string {
  const key = (city ?? '').trim().toLowerCase();
  return ZONE_MAP[key] ?? titleCase((city ?? '').trim());
}
