import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Trip, TripStatus } from '@/types';

interface UseTripResult {
  trip: Trip | null;
  pickups: Set<string>; // rider_ids already picked up
  loading: boolean;
  error: string | null;
  startTrip: (riderIds: string[]) => Promise<Trip | null>;
  setStatus: (status: TripStatus) => Promise<void>;
  togglePickup: (riderId: string) => Promise<void>;
}

let tripChannelSeq = 0;

/**
 * Loads and live-syncs the trip + pickups for a driver on a date. Riders use it
 * read-only (RLS lets them SELECT trips they're in); the driver also gets the
 * write actions (start, status, pickup), which RLS restricts to the driver.
 */
export function useTrip(driverId: string | null, iso: string): UseTripResult {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pickups, setPickups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrip = useCallback(async (): Promise<void> => {
    if (!driverId) {
      setTrip(null);
      setPickups(new Set());
      setLoading(false);
      return;
    }
    try {
      const { data, error: tErr } = await supabase
        .from('trips')
        .select('*')
        .eq('driver_id', driverId)
        .eq('ride_date', iso)
        .maybeSingle();
      if (tErr) {
        setError('Could not load the trip. Please try again.');
        return;
      }
      const tr = (data as Trip | null) ?? null;
      setTrip(tr);
      if (tr) {
        const { data: p } = await supabase
          .from('trip_pickups')
          .select('rider_id')
          .eq('trip_id', tr.id);
        setPickups(
          new Set((p ?? []).map((r) => (r as { rider_id: string }).rider_id)),
        );
      } else {
        setPickups(new Set());
      }
      setError(null);
    } catch {
      setError('Could not load the trip. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [driverId, iso]);

  useEffect(() => {
    void fetchTrip();
    if (!driverId) return;

    tripChannelSeq += 1;
    const channel = supabase
      .channel(`trip-${tripChannelSeq}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `driver_id=eq.${driverId}`,
        },
        () => void fetchTrip(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_pickups' },
        () => void fetchTrip(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId, fetchTrip]);

  const startTrip = useCallback(
    async (riderIds: string[]): Promise<Trip | null> => {
      if (!driverId) return null;
      setError(null);
      try {
        const { data, error: upErr } = await supabase
          .from('trips')
          .upsert(
            {
              driver_id: driverId,
              ride_date: iso,
              rider_ids: riderIds,
              status: 'on_my_way',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'driver_id,ride_date' },
          )
          .select('*')
          .single();
        if (upErr || !data) {
          setError('Could not start the trip. Please try again.');
          return null;
        }
        const tr = data as Trip;
        setTrip(tr);
        return tr;
      } catch {
        setError('Could not start the trip. Please try again.');
        return null;
      }
    },
    [driverId, iso],
  );

  const setStatus = useCallback(
    async (status: TripStatus): Promise<void> => {
      if (!trip) return;
      setError(null);
      try {
        const { error: upErr } = await supabase
          .from('trips')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', trip.id);
        if (upErr) setError('Could not update the trip. Please try again.');
      } catch {
        setError('Could not update the trip. Please try again.');
      }
    },
    [trip],
  );

  const togglePickup = useCallback(
    async (riderId: string): Promise<void> => {
      if (!trip) return;
      setError(null);
      const had = pickups.has(riderId);
      try {
        if (had) {
          const { error: dErr } = await supabase
            .from('trip_pickups')
            .delete()
            .eq('trip_id', trip.id)
            .eq('rider_id', riderId);
          if (dErr) setError('Could not update pickup. Please try again.');
        } else {
          const { error: iErr } = await supabase
            .from('trip_pickups')
            .insert({ trip_id: trip.id, rider_id: riderId });
          if (iErr) setError('Could not update pickup. Please try again.');
        }
      } catch {
        setError('Could not update pickup. Please try again.');
      }
    },
    [trip, pickups],
  );

  return { trip, pickups, loading, error, startTrip, setStatus, togglePickup };
}
