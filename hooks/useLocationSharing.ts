import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import * as Sentry from '@sentry/react-native';
import { LOCATION_TASK, setActiveTripChannel } from '@/lib/locationTask';
import { DEMO_MODE } from '@/lib/demoMode';

interface UseLocationSharingResult {
  sharing: boolean;
  error: string | null;
}

/**
 * While `active`, asks for location permission and streams the device's GPS
 * fixes to the background task (`lib/locationTask.ts`), which broadcasts them on
 * `channelName` so riders' maps track the car live. Unlike a foreground-only
 * watcher, `startLocationUpdatesAsync` keeps running when the driver locks the
 * phone mid-trip (blue indicator on iOS, foreground-service notification on
 * Android). Fully torn down when `active` goes false or the screen unmounts —
 * nothing is persisted.
 */
export function useLocationSharing(
  active: boolean,
  channelName: string,
): UseLocationSharingResult {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In demo mode the car is driven by useDemoDriverLocation, not by GPS, so
    // there is nothing to share — and both permission requests below raise a
    // system dialog right in the middle of the live-trip beat.
    //
    // Demo mode must STOP the task, not merely decline to start it.
    // `startLocationUpdatesAsync` registers natively and survives the JS bundle
    // being swapped, so a phone that ran a real trip and then loaded the demo
    // bundle would keep broadcasting the driver's actual GPS on the previous
    // trip's channel, with nothing in the demo UI to reveal it. Tearing down
    // here is the only place that can reach a registration the demo bundle
    // never created.
    if (DEMO_MODE) {
      setSharing(false);
      void (async () => {
        const started = await Location.hasStartedLocationUpdatesAsync(
          LOCATION_TASK,
        ).catch(() => false);
        if (started) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
        }
        // Detached with `void`, so an escaping rejection becomes an unhandled
        // one, and lib/sentry.ts's global handler turns those into a red LogBox
        // overlay — on stage, mid-demo. Teardown is best-effort by nature:
        // there is nothing useful to retry against, so report and move on.
        await setActiveTripChannel(null).catch((e: unknown) => {
          Sentry.captureException(e);
        });
      })();
      return;
    }

    if (!active || !channelName || channelName === 'noop') {
      setSharing(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setError(
              "Location permission denied — riders won't see your live location.",
            );
          }
          return;
        }
        // Ask for "Always" so sharing keeps running when the phone is locked or
        // the app is backgrounded mid-trip. If the driver keeps "While Using",
        // sharing still works in the foreground — so we don't block on it.
        await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

        await setActiveTripChannel(channelName);

        const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
          LOCATION_TASK,
        ).catch(() => false);
        if (!alreadyRunning) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            // Emit at most one fix every 8s (or per 15m moved, whichever comes
            // first — a stopped car stops emitting). The rider's marker eases
            // over each new fix in LiveMap, so this halves Realtime broadcast
            // volume with no visible change to the live-tracking experience.
            timeInterval: 8000,
            distanceInterval: 15,
            showsBackgroundLocationIndicator: true,
            activityType: Location.ActivityType.AutomotiveNavigation,
            pausesUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: 'Ridr live trip',
              notificationBody: 'Sharing your live location with your carpool.',
              notificationColor: '#0F8B8D',
            },
          });
        }

        if (!cancelled) {
          setSharing(true);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Could not start location sharing.');
      }
    })();

    return () => {
      cancelled = true;
      setSharing(false);
      void (async () => {
        const started = await Location.hasStartedLocationUpdatesAsync(
          LOCATION_TASK,
        ).catch(() => false);
        if (started) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
        }
        // Detached with `void`, so an escaping rejection becomes an unhandled
        // one, and lib/sentry.ts's global handler turns those into a red LogBox
        // overlay — on stage, mid-demo. Teardown is best-effort by nature:
        // there is nothing useful to retry against, so report and move on.
        await setActiveTripChannel(null).catch((e: unknown) => {
          Sentry.captureException(e);
        });
      })();
    };
  }, [active, channelName]);

  return { sharing, error };
}
