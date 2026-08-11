import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LOC_EVENT, type LocPayload } from '@/lib/liveTrip';
import type { GeoPoint } from '@/types';
import { DEMO_MODE } from '@/lib/demoMode';
import { useDemoDriverLocation } from '@/hooks/useDemoDriverLocation';

/** Stable empty route so the demo hook's deps don't churn. */
const NO_ROUTE: GeoPoint[] = [];

/** Synthetic-movement options, honoured only when DEMO_MODE is on. */
export interface DemoDriverOptions {
  active: boolean; // the trip is running, so the car should be moving
  route: GeoPoint[];
}

/**
 * Subscribes to a driver's live-location broadcast channel and returns the most
 * recent GPS fix. This is the React Native side of what the old Leaflet webview
 * did inline: with the native map (`react-native-maps`) the component owns the
 * realtime subscription and drives the car marker from `payload`.
 *
 * Broadcast is ephemeral (nothing is persisted), so when the trip ends or the
 * screen unmounts the channel is simply removed.
 */
export function useLiveDriverLocation(
  channelName: string,
  demo?: DemoDriverOptions,
): LocPayload | null {
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

  // Called unconditionally so hook order never differs between demo and normal
  // builds. With DEMO_MODE folded to `false` at bundle time this is a no-op
  // hook that creates no timer, and the return below is literally `payload`.
  const synthetic = useDemoDriverLocation(
    DEMO_MODE && (demo?.active ?? false),
    demo?.route ?? NO_ROUTE,
  );

  return DEMO_MODE ? (synthetic ?? payload) : payload;
}
