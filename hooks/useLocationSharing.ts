import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { LOCATION_TASK, setActiveTripChannel } from '@/lib/locationTask';

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
            timeInterval: 4000,
            distanceInterval: 15,
            showsBackgroundLocationIndicator: true,
            activityType: Location.ActivityType.AutomotiveNavigation,
            pausesUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: 'BasisRide live trip',
              notificationBody: 'Sharing your live location with your carpool.',
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
        await setActiveTripChannel(null);
      })();
    };
  }, [active, channelName]);

  return { sharing, error };
}
