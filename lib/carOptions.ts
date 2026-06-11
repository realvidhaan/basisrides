/**
 * Single source of truth for the carpool vehicle look. A parent picks a color
 * and a body type; everything that draws a car (the ride-card illustration and
 * the live-map marker) reads its shades from here so the same car looks
 * consistent everywhere — the "your driver's blue minivan" idea.
 */

export type CarColorKey =
  | 'crimson'
  | 'black'
  | 'white'
  | 'silver'
  | 'blue'
  | 'green'
  | 'gray'
  | 'orange';

export type CarTypeKey = 'sedan' | 'suv' | 'minivan';

export interface CarColor {
  key: CarColorKey;
  label: string;
  base: string; // main body
  dark: string; // lower panels / shadow side (3D depth)
  light: string; // top sheen / highlight
}

export interface CarType {
  key: CarTypeKey;
  label: string;
}

/** Glass is constant across colors so windows read the same on every car. */
export const CAR_GLASS = '#C7DCEC';

export const CAR_COLORS: CarColor[] = [
  { key: 'crimson', label: 'Crimson', base: '#DC143C', dark: '#A50F2D', light: '#F0556F' },
  { key: 'black', label: 'Black', base: '#2B2F36', dark: '#16191D', light: '#454B54' },
  { key: 'white', label: 'White', base: '#EDEFF2', dark: '#C7CCD3', light: '#FBFCFD' },
  { key: 'silver', label: 'Silver', base: '#AEB4BD', dark: '#878E98', light: '#CDD2D9' },
  { key: 'blue', label: 'Blue', base: '#2563EB', dark: '#1A47B0', light: '#5B86F2' },
  { key: 'green', label: 'Green', base: '#1F9D55', dark: '#16713D', light: '#45BE78' },
  { key: 'gray', label: 'Gray', base: '#6A707C', dark: '#4C515B', light: '#8A909B' },
  { key: 'orange', label: 'Orange', base: '#F08A24', dark: '#C26A12', light: '#F7A852' },
];

export const CAR_TYPES: CarType[] = [
  { key: 'sedan', label: 'Sedan' },
  { key: 'suv', label: 'SUV' },
  { key: 'minivan', label: 'Minivan' },
];

const DEFAULT_COLOR = CAR_COLORS[3]; // silver — neutral fallback

/** Resolve a stored color key (possibly null/legacy) to a palette entry. */
export function carColor(key: string | null | undefined): CarColor {
  return CAR_COLORS.find((c) => c.key === key) ?? DEFAULT_COLOR;
}

/** Resolve a stored type key (possibly null/legacy) to a valid body type. */
export function carType(key: string | null | undefined): CarTypeKey {
  return CAR_TYPES.find((t) => t.key === key)?.key ?? 'sedan';
}

export function carColorLabel(key: string | null | undefined): string {
  return carColor(key).label;
}

export function carTypeLabel(key: string | null | undefined): string {
  return CAR_TYPES.find((t) => t.key === carType(key))?.label ?? 'Sedan';
}
