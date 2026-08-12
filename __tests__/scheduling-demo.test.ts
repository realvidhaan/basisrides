import { nextSchoolDay, schoolDayStatus } from '@/lib/schoolCalendar';
import { toISO } from '@/lib/dateUtils';
import { DEMO_ROUTE, DEMO_STOPS, positionAt } from '@/lib/demoRoute';

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
  const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
    const mLat = 111_320;
    const mLng = mLat * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot((b.lat - a.lat) * mLat, (b.lng - a.lng) * mLng);
  };

  // NOTE: `metres` below repeats the same equirectangular model `lib/demoRoute`
  // uses, so the linearity test proves positionAt maps progress consistently
  // THROUGH that model — it cannot catch an error IN the model, e.g. a wrong
  // metres-per-degree constant. This absolute check pins the constant against
  // an independently known fact: OSRM reported 12.64 km for this route.
  it('measures the route at its known real-world length', () => {
    let path = 0;
    for (let i = 1; i < DEMO_ROUTE.length; i += 1) path += metres(DEMO_ROUTE[i - 1], DEMO_ROUTE[i]);
    expect(path / 1000).toBeGreaterThan(12.3);
    expect(path / 1000).toBeLessThan(13.0);
  });

  it('is a real multi-point road route, not a straight line', () => {
    expect(DEMO_ROUTE.length).toBeGreaterThan(100);
    // A straight line would make the path length equal the start→end distance.
    let path = 0;
    for (let i = 1; i < DEMO_ROUTE.length; i += 1) path += metres(DEMO_ROUTE[i - 1], DEMO_ROUTE[i]);
    const direct = metres(DEMO_ROUTE[0], DEMO_ROUTE[DEMO_ROUTE.length - 1]);
    expect(path).toBeGreaterThan(direct * 1.15);
  });

  it('starts at school and ends at the driver home, with stops in between', () => {
    expect(DEMO_STOPS[0].kind).toBe('school');
    expect(DEMO_STOPS[0].index).toBe(0);
    expect(DEMO_STOPS[DEMO_STOPS.length - 1].kind).toBe('driver');
    expect(DEMO_STOPS[DEMO_STOPS.length - 1].index).toBe(DEMO_ROUTE.length - 1);
    // indices strictly increase, so stops are visited in drive order
    for (let i = 1; i < DEMO_STOPS.length; i += 1) {
      expect(DEMO_STOPS[i].index).toBeGreaterThan(DEMO_STOPS[i - 1].index);
      expect(DEMO_STOPS[i].index).toBeLessThan(DEMO_ROUTE.length);
    }
  });

  it('holds a STEADY speed — progress is linear in distance ALONG the route', () => {
    // The property the demo is judged on: the car must not crawl through dense
    // turn geometry and then rocket down a sparse expressway stretch.
    //
    // Measured along the path, not as straight-line distance between samples:
    // rounding a corner genuinely covers less straight-line distance for the
    // same road distance, so a chord metric reports a false slowdown at every
    // turn. Road distance is what "constant speed" actually means.
    const cumulative = [0];
    for (let i = 1; i < DEMO_ROUTE.length; i += 1) {
      cumulative.push(cumulative[i - 1] + metres(DEMO_ROUTE[i - 1], DEMO_ROUTE[i]));
    }
    const total = cumulative[cumulative.length - 1];

    const alongRoute = (f: number): number => {
      const { point, index } = positionAt(f);
      return cumulative[index] + metres(DEMO_ROUTE[index], point);
    };

    const SAMPLES = 200;
    let worst = 0;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const f = i / SAMPLES;
      worst = Math.max(worst, Math.abs(alongRoute(f) - f * total) / total);
    }
    // Sub-1% of a 12.6 km route is ~100 m of drift across the whole drive.
    expect(worst).toBeLessThan(0.01);
  });

  it('is monotonic, finite, and clamps at both ends', () => {
    expect(positionAt(0).point).toEqual(DEMO_ROUTE[0]);
    expect(positionAt(1).point).toEqual(DEMO_ROUTE[DEMO_ROUTE.length - 1]);
    expect(positionAt(-5).point).toEqual(DEMO_ROUTE[0]);
    expect(positionAt(99).point).toEqual(DEMO_ROUTE[DEMO_ROUTE.length - 1]);

    let travelled = 0;
    let prev = positionAt(0).point;
    for (let i = 1; i <= 200; i += 1) {
      const p = positionAt(i / 200);
      expect(Number.isFinite(p.point.lat)).toBe(true);
      expect(Number.isFinite(p.point.lng)).toBe(true);
      expect(Number.isFinite(p.heading)).toBe(true);
      expect(p.heading).toBeGreaterThanOrEqual(0);
      expect(p.heading).toBeLessThan(360);
      travelled += metres(prev, p.point);
      prev = p.point;
    }
    expect(travelled).toBeGreaterThan(10_000); // ~12.6 km route
  });

  it('advances the split index monotonically so the travelled line only grows', () => {
    let last = -1;
    for (let i = 0; i <= 200; i += 1) {
      const { index } = positionAt(i / 200);
      expect(index).toBeGreaterThanOrEqual(last);
      last = index;
    }
  });
});
