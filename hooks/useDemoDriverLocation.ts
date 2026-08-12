import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '@/types';
import type { LocPayload } from '@/lib/liveTrip';
import { DEMO_TICK_MS, DEMO_TRIP_SECONDS } from '@/lib/demoMode';
import { pointAlong } from '@/lib/demoRoute';

/**
 * Synthetic driver for DEMO_MODE (see lib/demoMode): walks the car along
 * `route` and emits fixes in the same shape the real broadcast delivers, so
 * everything downstream — the map, the car marker, its heading — is the
 * production code path with a different source of positions.
 *
 * Inert unless explicitly enabled: with `enabled` false no timer is ever
 * created, so a normal build pays nothing for this hook existing.
 */
export function useDemoDriverLocation(
  enabled: boolean,
  route: GeoPoint[],
): LocPayload | null {
  const [payload, setPayload] = useState<LocPayload | null>(null);

  // Depend on the route by VALUE: the parent rebuilds the array every render,
  // and keying on identity would restart the drive continuously.
  const routeKey = JSON.stringify(route);
  const routeRef = useRef(route);

  useEffect(() => {
    // Committed inside the effect, never during render — a render React throws
    // away must not be able to change what the running interval emits.
    routeRef.current = route;

    if (!enabled || routeRef.current.length < 2) {
      setPayload(null);
      return;
    }

    const steps = Math.max(1, Math.round((DEMO_TRIP_SECONDS * 1000) / DEMO_TICK_MS));
    let step = 0;
    const emit = (): void => {
      const pos = pointAlong(routeRef.current, step / steps);
      if (pos) setPayload({ lat: pos.point.lat, lng: pos.point.lng, heading: pos.heading });
    };

    emit(); // place the car at the start immediately, don't wait a full tick
    const timer = setInterval(() => {
      // Clamp at the destination and hold. Looping would teleport the car back
      // to school mid-demo, which reads as a bug.
      if (step >= steps) return;
      step += 1;
      emit();
    }, DEMO_TICK_MS);

    return () => clearInterval(timer);
    // `route` is intentionally tracked by value via routeKey, not by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, routeKey]);

  return payload;
}
