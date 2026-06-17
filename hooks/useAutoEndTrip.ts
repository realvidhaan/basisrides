import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import type { GeoPoint } from '@/types';
import { haversineMeters } from '@/lib/geo';

/**
 * Auto-ends a live after-school trip once the driver gets home from drop-offs.
 * Logic:
 *   1. Arm: do nothing until the driver has moved >250 m from their home coords.
 *      The trip starts at BISV (far from home), so this arms immediately and
 *      can't false-trigger in the driveway before they leave.
 *   2. Trigger: call `onEnd` once when the driver is back within ≤120 m of home.
 *
 * The school is deliberately NOT an end condition — for after-school carpool it
 * is the START point. The hook is purely passive: `onEnd` is called at most once
 * per `active` session. If location permission is unavailable it silently no-ops
 * and the driver can still tap "End early."
 */

const ARM_DISTANCE_M = 250;
const HOME_TRIGGER_M = 120;

export function useAutoEndTrip(
  active: boolean,
  home: GeoPoint | null,
  onEnd: () => void,
): void {
  const armedRef = useRef(false);
  const triggeredRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!active || !home) return;

    armedRef.current = false;
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
            const pos = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            };
            const distHome = haversineMeters(pos, home);

            if (!armedRef.current && distHome > ARM_DISTANCE_M) {
              armedRef.current = true;
            }

            if (!armedRef.current) return;

            if (distHome <= HOME_TRIGGER_M) {
              triggeredRef.current = true;
              onEndRef.current();
            }
          },
        );
      } catch {
        // Permission denied or device error — driver uses "End early" instead.
      }
    })();

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
    };
  }, [active, home]);
}
