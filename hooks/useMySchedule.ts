import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { DayRole, MyScheduleDay, WeekdayKey } from '@/types';

const DAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function emptyWeek(): Record<WeekdayKey, MyScheduleDay> {
  return {
    mon: { day: 'mon', role: 'off', dismissalTime: null },
    tue: { day: 'tue', role: 'off', dismissalTime: null },
    wed: { day: 'wed', role: 'off', dismissalTime: null },
    thu: { day: 'thu', role: 'off', dismissalTime: null },
    fri: { day: 'fri', role: 'off', dismissalTime: null },
  };
}

interface RawScheduleRow {
  day_of_week: string;
  role: DayRole | null;
  dismissal_time: string | null;
}

export interface UseMyScheduleResult {
  days: Record<WeekdayKey, MyScheduleDay>;
  loading: boolean;
  error: string | null;
  carCapacity: number;
  setDay: (day: WeekdayKey, role: DayRole, time: string | null) => Promise<void>;
}

/**
 * Loads and edits the signed-in parent's recurring weekly schedule (stored in
 * the `availability` table as role + dismissal_time per weekday). setDay does an
 * optimistic upsert with rollback on failure.
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
          .select('day_of_week, role, dismissal_time')
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
              role: row.role ?? 'off',
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
    async (day: WeekdayKey, role: DayRole, time: string | null): Promise<void> => {
      if (!user) {
        setError('You must be signed in.');
        return;
      }
      const snapshot = daysRef.current;
      const dismissalTime = role === 'off' ? null : time;
      setError(null);
      setDays((prev) => ({
        ...prev,
        [day]: { day, role, dismissalTime },
      }));

      try {
        const { error: upsertError } = await supabase.from('availability').upsert(
          {
            user_id: user.id,
            day_of_week: day,
            role,
            dismissal_time: dismissalTime,
            is_driving: role === 'drive',
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
