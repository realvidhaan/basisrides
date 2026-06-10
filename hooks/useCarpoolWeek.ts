import { useCallback, useEffect, useState } from 'react';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { CarpoolMember, DayCarpool, WeekdayKey } from '@/types';

interface RawCarpoolRow {
  day_of_week: string;
  zone: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_time: string | null;
  rider_id: string | null;
  rider_name: string | null;
  rider_time: string | null;
  matched: boolean;
}

const DAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Unique realtime topic per hook instance (see Day 2 fix: same-topic channels
// throw when a second .on() runs after the first subscribed).
let channelSeq = 0;

function emptyByDay(): Record<WeekdayKey, DayCarpool> {
  return {
    mon: { groups: [], unmatchedRiders: [] },
    tue: { groups: [], unmatchedRiders: [] },
    wed: { groups: [], unmatchedRiders: [] },
    thu: { groups: [], unmatchedRiders: [] },
    fri: { groups: [], unmatchedRiders: [] },
  };
}

function build(rows: RawCarpoolRow[]): Record<WeekdayKey, DayCarpool> {
  const byDay = emptyByDay();
  // driverId -> index in that day's groups array, per day
  const driverIndex: Record<string, number> = {};

  for (const row of rows) {
    if (!DAY_KEYS.includes(row.day_of_week as WeekdayKey)) continue;
    const day = row.day_of_week as WeekdayKey;
    const bucket = byDay[day];

    if (row.driver_id) {
      const groupKey = `${day}:${row.driver_id}`;
      let idx = driverIndex[groupKey];
      if (idx === undefined) {
        bucket.groups.push({
          driver: {
            userId: row.driver_id,
            name: row.driver_name ?? '',
            time: row.driver_time,
          },
          riders: [],
          zone: row.zone,
        });
        idx = bucket.groups.length - 1;
        driverIndex[groupKey] = idx;
      }
      if (row.rider_id) {
        bucket.groups[idx].riders.push({
          userId: row.rider_id,
          name: row.rider_name ?? '',
          time: row.rider_time,
        });
      }
    } else if (row.rider_id) {
      bucket.unmatchedRiders.push({
        userId: row.rider_id,
        name: row.rider_name ?? '',
        time: row.rider_time,
      });
    }
  }

  return byDay;
}

export interface UseCarpoolWeekResult {
  byDay: Record<WeekdayKey, DayCarpool>;
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  refetch: () => Promise<void>;
}

/**
 * Loads the deterministic, server-computed carpool groups for the whole week
 * (get_carpool_week RPC), grouped per weekday, and keeps them live by
 * re-fetching whenever anyone's schedule (availability) changes.
 */
export function useCarpoolWeek(): UseCarpoolWeekResult {
  const { user } = useCurrentUser();
  const [byDay, setByDay] = useState<Record<WeekdayKey, DayCarpool>>(emptyByDay);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeek = useCallback(async (silent: boolean): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_carpool_week');
      if (rpcError) {
        setError(mapSupabaseError(rpcError));
        return;
      }
      const rows = (data ?? []) as unknown as RawCarpoolRow[];
      setByDay(build(rows));
      setError(null);
    } catch {
      setError('Something went wrong loading carpools. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWeek(false);

    channelSeq += 1;
    const channel = supabase
      .channel(`carpool-${channelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        () => {
          void fetchWeek(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchWeek]);

  return {
    byDay,
    loading,
    error,
    currentUserId: user?.id ?? null,
    refetch: () => fetchWeek(false),
  };
}
