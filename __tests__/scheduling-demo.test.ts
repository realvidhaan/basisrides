import { nextSchoolDay, schoolDayStatus } from '@/lib/schoolCalendar';
import { toISO } from '@/lib/dateUtils';
import { buildDemoRoute, pointAlong } from '@/lib/demoRoute';
import type { MapStop } from '@/types';

describe('nextSchoolDay', () => {
  it('moves today (2026-08-11, day before term) to the first school day', () => {
    expect(toISO(nextSchoolDay(new Date(2026, 7, 11)))).toBe('2026-08-12');
  });
  it('keeps an in-year school day unchanged', () => {
    const d = nextSchoolDay(new Date(2026, 8, 16)); // Wed 2026-09-16
    expect(schoolDayStatus(d).blocked).toBe(false);
    expect(toISO(d)).toBe('2026-09-16');
  });
  it('skips a weekend to Monday', () => {
    expect(toISO(nextSchoolDay(new Date(2026, 8, 19)))).toBe('2026-09-21'); // Sat -> Mon
  });
  it('never returns a blocked day inside the year', () => {
    for (let i = 0; i < 120; i += 1) {
      const from = new Date(2026, 7, 1 + i);
      const d = nextSchoolDay(from);
      if (d.getTime() >= nextSchoolDay(new Date(2026, 7, 11)).getTime()) {
        expect(schoolDayStatus(d).blocked).toBe(false);
      }
    }
  });
  it('terminates past the end of the year instead of spinning', () => {
    const past = new Date(2027, 11, 25);
    expect(toISO(nextSchoolDay(past))).toBe('2027-12-25');
  });
});

describe('demo route', () => {
  const stops: MapStop[] = [
    { id: 'school', name: 'BISV', point: { lat: 37.3197, lng: -121.912 }, kind: 'school' },
    { id: 'r1', name: 'R1', point: { lat: 37.34, lng: -121.93 }, kind: 'rider' },
    { id: 'r2', name: 'R2', point: { lat: 37.33, lng: -121.92 }, kind: 'rider' },
  ];
  const home = { lat: 37.35, lng: -121.95 };

  it('orders school -> nearest riders -> driver home', () => {
    const r = buildDemoRoute(stops, home);
    expect(r[0]).toEqual(stops[0].point);
    expect(r[1]).toEqual(stops[2].point); // r2 is nearer the school than r1
    expect(r[r.length - 1]).toEqual(home);
  });

  it('returns [] when there is nothing to drive (degenerate input)', () => {
    expect(buildDemoRoute([stops[0]], null)).toEqual([]);
    expect(buildDemoRoute([], null)).toEqual([]);
  });

  it('interpolates monotonically from start to end', () => {
    const r = buildDemoRoute(stops, home);
    const a = pointAlong(r, 0);
    const b = pointAlong(r, 1);
    expect(a?.point).toEqual(r[0]);
    expect(b?.point.lat).toBeCloseTo(home.lat, 4);
    expect(b?.point.lng).toBeCloseTo(home.lng, 4);
    expect(Number.isFinite(a?.heading ?? NaN)).toBe(true);
  });

  it('never yields NaN coordinates across the whole traversal', () => {
    const r = buildDemoRoute(stops, home);
    for (let i = 0; i <= 90; i += 1) {
      const p = pointAlong(r, i / 90);
      expect(Number.isFinite(p?.point.lat ?? NaN)).toBe(true);
      expect(Number.isFinite(p?.point.lng ?? NaN)).toBe(true);
    }
  });
});
