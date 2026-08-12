import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LOC_EVENT, type LocPayload } from '@/lib/liveTrip';

/**
 * Subscribes to a driver's live-location broadcast channel and returns the most
 * recent GPS fix. This is the React Native side of what the old Leaflet webview
 * did inline: with the native map (`react-native-maps`) the component owns the
 * realtime subscription and drives the car marker from `payload`.
 *
 * Broadcast is ephemeral (nothing is persisted), so when the trip ends or the
 * screen unmounts the channel is simply removed.
 */
export function useLiveDriverLocation(channelName: string): LocPayload | null {
  const [payload, setPayload] = useState<LocPayload | null>(null);

  useEffect(() => {
    // 'noop' is the placeholder LiveTripScreen passes before a driver is known.
    if (!channelName || channelName === 'noop') {
      setPayload(null);
      return;
    }

    let cancelled = false;
    const channel = supabase.channel(channelName);
    channel
      .on('broadcast', { event: LOC_EVENT }, (msg) => {
        if (cancelled) return;
        const p = (msg.payload ?? {}) as Partial<LocPayload>;
        if (typeof p.lat === 'number' && typeof p.lng === 'number') {
          setPayload({ lat: p.lat, lng: p.lng, heading: p.heading ?? null });
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [channelName]);

  return payload;
}
