import { useEffect } from 'react';
import * as Location from 'expo-location';
import * as Sentry from '@sentry/react-native';
import type { GeoPoint } from '@/types';
import {
  GEOFENCE_TASK,
  HOME_REGION_ID,
  PICKUP_REGION_ID,
  setGeofenceContext,
} from '@/lib/geofenceTask';
import { DEMO_MODE } from '@/lib/demoMode';

const PICKUP_RADIUS_M = 120;
const HOME_RADIUS_M = 120;

interface Params {
  enabled: boolean; // driver on this date, trip not yet ended
  driverId: string | null;
  iso: string;
  riderIds: string[];
  pickup: GeoPoint; // school — auto-start region
  home: GeoPoint | null; // driver's home — auto-end region
  tripActive: boolean; // trip is on_my_way → watch home for arrival
}

/**
 * Drives the live trip with geofences instead of a foreground watcher, so it
 * works even when the app is backgrounded or killed (requires "Always" location
 * permission; falls back to foreground-only if the user keeps "When In Use").
 *
 * - While the driver has a pending trip, a geofence around school auto-starts it
 *   on arrival (iOS reports the initial state, so being already at school fires
 *   immediately too).
 * - Once the trip is active, a home geofence is added so arriving home after the
 *   drop-offs auto-ends it. The auto-end only fires after the driver is confirmed
 *   away from home (reached school, or left the home region), so iOS's
 *   initial-state Enter on (re)registration — e.g. after an app restart while the
 *   driver is home — can't false-complete the trip. See lib/geofenceTask.ts.
 *
 * The actual DB writes happen in the geofence task (`lib/geofenceTask.ts`);
 * `useTrip`'s realtime subscription then updates the UI.
 */
export function useTripGeofencing({
  enabled,
  driverId,
  iso,
  riderIds,
  pickup,
  home,
  tripActive,
}: Params): void {
  // Re-register only when something meaningful changes (not on every render).
  const key = [
    enabled,
    driverId,
    iso,
    riderIds.join(','),
    `${pickup.lat},${pickup.lng}`,
    home ? `${home.lat},${home.lng}` : 'nohome',
    tripActive,
  ].join('|');

  useEffect(() => {
    // Geofences cannot fire indoors and the permission prompts land mid-demo, so
    // the demo never registers them. "Start ride" on LiveTripScreen is the
    // manual entry point and already exists — nothing else is lost.
    let cancelled = false;

    async function stop(): Promise<void> {
      const running = await Location.hasStartedGeofencingAsync(
        GEOFENCE_TASK,
      ).catch(() => false);
      if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
      // Every caller detaches this with `void`, so an escaping rejection becomes
      // an unhandled one and lib/sentry.ts's global handler renders a red LogBox
      // over the screen. Teardown is best-effort; report and move on.
      await setGeofenceContext(null).catch((e: unknown) => {
        Sentry.captureException(e);
      });
    }

    // Demo mode STOPS rather than skips, for the same reason as
    // useLocationSharing: `startGeofencingAsync` registers natively and outlives
    // the JS bundle, so a device that ran a real trip could still fire a school
    // or home transition — silently flipping a real `trips` row to
    // 'on_my_way'/'completed' — while the demo bundle is on screen.
    if (DEMO_MODE) {
      void stop();
      return;
    }

    if (!enabled || !driverId) {
      void stop();
      return;
    }

    void (async () => {
      try {
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted' || cancelled) return;
        // "Always" is needed for geofencing to fire while backgrounded/killed.
        // If the user only grants "When In Use", geofencing still works while
        // the app is alive — so we proceed regardless of the result.
        await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
        if (cancelled) return;

        await setGeofenceContext({ driverId, iso, riderIds });

        const regions: Location.LocationRegion[] = [
          {
            identifier: PICKUP_REGION_ID,
            latitude: pickup.lat,
            longitude: pickup.lng,
            radius: PICKUP_RADIUS_M,
            notifyOnEnter: true,
            notifyOnExit: false,
          },
        ];
        if (tripActive && home) {
          regions.push({
            identifier: HOME_REGION_ID,
            latitude: home.lat,
            longitude: home.lng,
            radius: HOME_RADIUS_M,
            notifyOnEnter: true,
            // Exit arms the auto-end: leaving home proves the driver is out on the
            // run, so a later arrival home can safely complete the trip.
            notifyOnExit: true,
          });
        }

        if (!cancelled) await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
      } catch {
        // Geofencing unsupported or permission denied — manual controls remain.
      }
    })();

    return () => {
      cancelled = true;
      void stop();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
