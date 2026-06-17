import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import type { GeoPoint } from '@/types';
import { haversineMeters } from '@/lib/geo';

/**
 * Auto-starts a live trip when the driver reaches a pickup point — the
 * replacement for the old manual "Start ride" button.
 *
 * While `enabled` (driver, no trip started yet), a single foreground location
 * watcher runs; the moment the driver comes within PICKUP_TRIGGER_M of any
 * pickup point (a rider's home), `onStart` fires exactly once. Mirrors
 * useAutoEndTrip: single-fire (guarded by a ref), and the subscription is fully
 * removed when `enabled` goes false (the trip started) or on unmount — so there
 * is never a duplicate or leaked location watcher.
 *
 * If location permission is unavailable the hook silently no-ops (the trip just
 * won't auto-start), exactly like useAutoEndTrip's no-permission behavior.
 */

const PICKUP_TRIGGER_M = 120;

export function useAutoStartTrip(
  enabled: boolean,
  pickupPoints: GeoPoint[],
  onStart: () => void,
): void {
  const triggeredRef = useRef(false);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  // Key on the coordinate values (not array identity) so the watcher isn't torn
  // down and re-created on every render when the points haven't actually moved.
  const pointsKey = pickupPoints.map((p) => `${p.lat},${p.lng}`).join('|');

  useEffect(() => {
    if (!enabled || pickupPoints.length === 0) return;

    triggeredRef.current = false;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 20,
          },
          (loc) => {
            if (cancelled || triggeredRef.current) return;
            const pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            let nearest = Infinity;
            for (const point of pickupPoints) {
              const d = haversineMeters(pos, point);
              if (d < nearest) nearest = d;
            }
            if (nearest <= PICKUP_TRIGGER_M) {
              triggeredRef.current = true;
              onStartRef.current();
            }
          },
        );
      } catch {
        // Permission denied or device error — trip simply won't auto-start.
      }
    })();

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
    };
    // pickupPoints intentionally excluded; pointsKey captures value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pointsKey]);
}
