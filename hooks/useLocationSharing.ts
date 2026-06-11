import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { LOC_EVENT, type LocPayload } from '@/lib/liveTrip';

interface UseLocationSharingResult {
  sharing: boolean;
  error: string | null;
}

/**
 * While `active`, asks for location permission and broadcasts the device's GPS
 * fixes on `channelName` so riders' maps can track the car live. Works on web
 * (browser geolocation) and native (expo-location). Fully cleaned up when
 * `active` goes false or the screen unmounts — nothing is persisted.
 */
export function useLocationSharing(
  active: boolean,
  channelName: string,
): UseLocationSharingResult {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setSharing(false);
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let subscribed = false;
    const channel = supabase.channel(channelName);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') subscribed = true;
    });

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
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 15,
          },
          (loc) => {
            if (cancelled || !subscribed) return;
            const payload: LocPayload = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              heading: loc.coords.heading ?? null,
            };
            void channel.send({ type: 'broadcast', event: LOC_EVENT, payload });
          },
        );
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
      if (subscription) subscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [active, channelName]);

  return { sharing, error };
}
