import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getWeekDates, parseISO, toISO } from '@/lib/dateUtils';
import type { DayData, RideWithDriver } from '@/types';

// Shape of a single fetched rides row with its embedded driver/rider profiles.
// Embeds use FK hints in the select, so each is a single object (or null).
interface RawRideRow {
  id: string;
  driver_id: string;
  rider_id: string;
  date: string;
  status: string;
  created_at: string;
  driver: { full_name: string; car_capacity: number; neighborhood: string } | null;
  rider: { full_name: string } | null;
}

const RIDE_SELECT =
  '*, driver:users!rides_driver_id_fkey(full_name,car_capacity,neighborhood),' +
  ' rider:users!rides_rider_id_fkey(full_name)';

// Monotonic temp ids for optimistic rows (avoids key collisions before the
// real server row arrives via refetch / realtime).
let tempCounter = 0;
function tempId(): string {
  tempCounter += 1;
  return `optimistic-${tempCounter}`;
}

function seatsFor(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}

function buildRidesByDate(
  rows: RawRideRow[],
  weekStartISO: string,
): Record<string, DayData> {
  const byDate: Record<string, DayData> = {};

  // Seed every weekday so empty days still render.
  for (const d of getWeekDates(parseISO(weekStartISO))) {
    const iso = toISO(d);
    byDate[iso] = { date: iso, driver: null, riders: [], seatsAvailable: 0 };
  }

  const grouped: Record<string, RawRideRow[]> = {};
  for (const row of rows) {
    (grouped[row.date] ??= []).push(row);
  }

  for (const iso of Object.keys(grouped)) {
    const dayRows = grouped[iso];
    const driverRow = dayRows.find((r) => r.driver_id === r.rider_id) ?? null;
    const capacity = driverRow?.driver?.car_capacity ?? 0;
    const driverName = driverRow?.driver?.full_name ?? '';
    const driverNeighborhood = driverRow?.driver?.neighborhood ?? '';

    const enrich = (r: RawRideRow): RideWithDriver => ({
      id: r.id,
      driver_id: r.driver_id,
      rider_id: r.rider_id,
      date: r.date,
      status: r.status,
      created_at: r.created_at,
      driverName,
      driverCapacity: capacity,
      driverNeighborhood,
      riderName: r.rider?.full_name ?? '',
    });

    const driver = driverRow ? enrich(driverRow) : null;
    const riders = dayRows
      .filter((r) => r.driver_id !== r.rider_id)
      .map(enrich);
    const occupied = dayRows.length; // driver self-row + rider rows
    byDate[iso] = {
      date: iso,
      driver,
      riders,
      seatsAvailable: driver ? seatsFor(capacity, occupied) : 0,
    };
  }

  return byDate;
}

export interface UseWeekRidesResult {
  ridesByDate: Record<string, DayData>;
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  refetch: () => Promise<void>;
  offerToDrive: (date: string) => Promise<void>;
  claimSeat: (date: string) => Promise<void>;
  cancelSeat: (date: string) => Promise<void>;
}

/**
 * Loads every ride for the given week (joined with driver + rider names),
 * groups them into per-day DayData, and keeps the data live via a Supabase
 * realtime subscription on the rides table. Also exposes optimistic mutators
 * for offer/claim/cancel so the schedule and detail screens stay in sync.
 */
export function useWeekRides(
  weekStart: string,
  weekEnd: string,
): UseWeekRidesResult {
  const { user } = useCurrentUser();
  const [ridesByDate, setRidesByDate] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mirror of the latest committed state so optimistic mutators can snapshot &
  // roll back without stale closures.
  const ridesRef = useRef<Record<string, DayData>>(ridesByDate);
  useEffect(() => {
    ridesRef.current = ridesByDate;
  }, [ridesByDate]);

  const fetchWeek = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('rides')
          .select(RIDE_SELECT)
          .gte('date', weekStart)
          .lte('date', weekEnd);

        if (fetchError) {
          setError(mapSupabaseError(fetchError));
          return;
        }

        const rows = (data ?? []) as unknown as RawRideRow[];
        setRidesByDate(buildRidesByDate(rows, weekStart));
        setError(null);
      } catch {
        setError('Something went wrong loading the schedule. Please try again.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [weekStart, weekEnd],
  );

  useEffect(() => {
    void fetchWeek(false);

    const channel = supabase
      .channel(`rides-${weekStart}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        () => {
          void fetchWeek(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchWeek, weekStart]);

  const uid = user?.id ?? null;

  const offerToDrive = useCallback(
    async (date: string): Promise<void> => {
      if (!user) {
        setError('You must be signed in to offer a ride.');
        return;
      }
      const snapshot = ridesRef.current;
      const existing = snapshot[date];
      if (existing?.driver) {
        setError('Someone is already driving that day.');
        return;
      }

      const capacity = user.car_capacity;
      const optimisticDriver: RideWithDriver = {
        id: tempId(),
        driver_id: user.id,
        rider_id: user.id,
        date,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        driverName: user.full_name,
        driverCapacity: capacity,
        driverNeighborhood: user.neighborhood,
        riderName: user.full_name,
      };

      setError(null);
      setRidesByDate((prev) => ({
        ...prev,
        [date]: {
          date,
          driver: optimisticDriver,
          riders: [],
          seatsAvailable: seatsFor(capacity, 1),
        },
      }));

      try {
        const { error: insertError } = await supabase.from('rides').insert({
          driver_id: user.id,
          rider_id: user.id,
          date,
          status: 'confirmed',
        });
        if (insertError) {
          setRidesByDate(snapshot);
          setError(mapSupabaseError(insertError));
          return;
        }
        await fetchWeek(true);
      } catch {
        setRidesByDate(snapshot);
        setError('Could not offer to drive. Please try again.');
      }
    },
    [user, fetchWeek],
  );

  const claimSeat = useCallback(
    async (date: string): Promise<void> => {
      if (!user) {
        setError('You must be signed in to claim a seat.');
        return;
      }
      const snapshot = ridesRef.current;
      const day = snapshot[date];
      if (!day || !day.driver) {
        setError('There is no driver for that day yet.');
        return;
      }
      const occupied = 1 + day.riders.length;
      if (occupied >= day.driver.driverCapacity) {
        setError('That car is full.');
        return;
      }
      if (day.driver.driver_id === user.id) return; // driver can't claim own seat
      if (day.riders.some((r) => r.rider_id === user.id)) return; // already riding

      const driverId = day.driver.driver_id;
      const optimisticRider: RideWithDriver = {
        id: tempId(),
        driver_id: driverId,
        rider_id: user.id,
        date,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        driverName: day.driver.driverName,
        driverCapacity: day.driver.driverCapacity,
        driverNeighborhood: day.driver.driverNeighborhood,
        riderName: user.full_name,
      };

      setError(null);
      setRidesByDate((prev) => {
        const current = prev[date];
        if (!current || !current.driver) return prev;
        const riders = [...current.riders, optimisticRider];
        return {
          ...prev,
          [date]: {
            ...current,
            riders,
            seatsAvailable: seatsFor(
              current.driver.driverCapacity,
              1 + riders.length,
            ),
          },
        };
      });

      try {
        const { error: insertError } = await supabase.from('rides').insert({
          driver_id: driverId,
          rider_id: user.id,
          date,
          status: 'confirmed',
        });
        if (insertError) {
          setRidesByDate(snapshot);
          setError(mapSupabaseError(insertError));
          return;
        }
        await fetchWeek(true);
      } catch {
        setRidesByDate(snapshot);
        setError('Could not claim a seat. Please try again.');
      }
    },
    [user, fetchWeek],
  );

  const cancelSeat = useCallback(
    async (date: string): Promise<void> => {
      if (!user) {
        setError('You must be signed in.');
        return;
      }
      const snapshot = ridesRef.current;
      const day = snapshot[date];
      if (!day || !day.driver) return;

      setError(null);
      setRidesByDate((prev) => {
        const current = prev[date];
        if (!current || !current.driver) return prev;
        const riders = current.riders.filter((r) => r.rider_id !== user.id);
        return {
          ...prev,
          [date]: {
            ...current,
            riders,
            seatsAvailable: seatsFor(
              current.driver.driverCapacity,
              1 + riders.length,
            ),
          },
        };
      });

      try {
        const { error: deleteError } = await supabase
          .from('rides')
          .delete()
          .eq('rider_id', user.id)
          .eq('date', date)
          .neq('driver_id', user.id);
        if (deleteError) {
          setRidesByDate(snapshot);
          setError(mapSupabaseError(deleteError));
          return;
        }
        await fetchWeek(true);
      } catch {
        setRidesByDate(snapshot);
        setError('Could not cancel your seat. Please try again.');
      }
    },
    [user, fetchWeek],
  );

  return {
    ridesByDate,
    loading,
    error,
    currentUserId: uid,
    refetch: () => fetchWeek(false),
    offerToDrive,
    claimSeat,
    cancelSeat,
  };
}
