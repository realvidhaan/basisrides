import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import type { GeoPoint } from '@/types';
import { SCHOOL } from '@/lib/places';

/**
 * Auto-ends a live trip once the driver returns home (or reaches school for an
 * AM run). Logic:
 *   1. Arm: do nothing until the driver has moved >250 m from their home coords
 *      (prevents a false trigger the moment the ride starts while they're still
 *      in the driveway).
 *   2. Trigger: call `onEnd` once when the driver is ≤120 m from home OR
 *      ≤100 m from school.
 *
 * The hook is purely passive — `onEnd` is called at most once per `active`
 * session. If location permission is unavailable the hook silently no-ops and
 * the driver can still tap "End early."
 */

const ARM_DISTANCE_M = 250;
const HOME_TRIGGER_M = 120;
const SCHOOL_TRIGGER_M = 100;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2);
  const sb = Math.sin(dLng / 2);
  const c =
    sa * sa +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sb *
      sb;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

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
            const distSchool = haversineMeters(pos, SCHOOL.point);

            if (!armedRef.current && distHome > ARM_DISTANCE_M) {
              armedRef.current = true;
            }

            if (!armedRef.current) return;

            if (distHome <= HOME_TRIGGER_M || distSchool <= SCHOOL_TRIGGER_M) {
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
