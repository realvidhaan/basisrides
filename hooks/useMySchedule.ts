import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { MyScheduleDay, WeekdayKey } from '@/types';

const DAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function emptyWeek(): Record<WeekdayKey, MyScheduleDay> {
  return {
    mon: { day: 'mon', participating: false, dismissalTime: null },
    tue: { day: 'tue', participating: false, dismissalTime: null },
    wed: { day: 'wed', participating: false, dismissalTime: null },
    thu: { day: 'thu', participating: false, dismissalTime: null },
    fri: { day: 'fri', participating: false, dismissalTime: null },
  };
}

interface RawScheduleRow {
  day_of_week: string;
  participating: boolean | null;
  dismissal_time: string | null;
}

export interface UseMyScheduleResult {
  days: Record<WeekdayKey, MyScheduleDay>;
  loading: boolean;
  error: string | null;
  carCapacity: number;
  setDay: (
    day: WeekdayKey,
    participating: boolean,
    time: string | null,
  ) => Promise<void>;
}

/**
 * Loads and edits the signed-in parent's recurring weekly schedule. Parents
 * only set participation + pickup time per weekday; the rotation engine decides
 * drive vs ride. Optimistic upsert with rollback.
 */
export function useMySchedule(): UseMyScheduleResult {
  const { user } = useCurrentUser();
  const [days, setDays] = useState<Record<WeekdayKey, MyScheduleDay>>(emptyWeek);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const daysRef = useRef(days);
  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const { data, error: loadError } = await supabase
          .from('availability')
          .select('day_of_week, participating, dismissal_time')
          .eq('user_id', user.id);
        if (!active) return;
        if (loadError) {
          setError(mapSupabaseError(loadError));
          return;
        }
        const rows = (data ?? []) as unknown as RawScheduleRow[];
        const next = emptyWeek();
        for (const row of rows) {
          if (DAY_KEYS.includes(row.day_of_week as WeekdayKey)) {
            const key = row.day_of_week as WeekdayKey;
            next[key] = {
              day: key,
              participating: Boolean(row.participating),
              dismissalTime: row.dismissal_time
                ? row.dismissal_time.slice(0, 5)
                : null,
            };
          }
        }
        setDays(next);
        setError(null);
      } catch {
        if (active) setError('Could not load your schedule. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const setDay = useCallback(
    async (
      day: WeekdayKey,
      participating: boolean,
      time: string | null,
    ): Promise<void> => {
      if (!user) {
        setError('You must be signed in.');
        return;
      }
      const snapshot = daysRef.current;
      const dismissalTime = participating ? time : null;
      setError(null);
      setDays((prev) => ({
        ...prev,
        [day]: { day, participating, dismissalTime },
      }));

      try {
        const { error: upsertError } = await supabase.from('availability').upsert(
          {
            user_id: user.id,
            day_of_week: day,
            participating,
            dismissal_time: dismissalTime,
            role: participating ? 'ride' : 'off', // legacy column; unused by rotation
            is_driving: false,
          },
          { onConflict: 'user_id,day_of_week' },
        );
        if (upsertError) {
          setDays(snapshot);
          setError(mapSupabaseError(upsertError));
        }
      } catch {
        setDays(snapshot);
        setError('Could not save your schedule. Please try again.');
      }
    },
    [user],
  );

  return {
    days,
    loading,
    error,
    carCapacity: user?.car_capacity ?? 0,
    setDay,
  };
}
