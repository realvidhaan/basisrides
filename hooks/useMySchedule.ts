import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { MyScheduleDay, WeekdayKey } from '@/types';

const DAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function emptyDay(day: WeekdayKey): MyScheduleDay {
  return { day, participating: false, dismissalTime: null, canDrive: false };
}

function emptyWeek(): Record<WeekdayKey, MyScheduleDay> {
  return {
    mon: emptyDay('mon'),
    tue: emptyDay('tue'),
    wed: emptyDay('wed'),
    thu: emptyDay('thu'),
    fri: emptyDay('fri'),
  };
}

interface RawScheduleRow {
  day_of_week: string;
  participating: boolean | null;
  dismissal_time: string | null;
  can_drive: boolean | null;
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
    canDrive: boolean,
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
          .select('day_of_week, participating, dismissal_time, can_drive')
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
              canDrive: Boolean(row.can_drive),
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
      canDrive: boolean,
    ): Promise<void> => {
      if (!user) {
        setError('You must be signed in.');
        return;
      }
      const snapshot = daysRef.current;
      const dismissalTime = participating ? time : null;
      const driving = participating && canDrive;
      setError(null);
      setDays((prev) => ({
        ...prev,
        [day]: { day, participating, dismissalTime, canDrive: driving },
      }));

      try {
        const { error: upsertError } = await supabase.from('availability').upsert(
          {
            user_id: user.id,
            day_of_week: day,
            participating,
            dismissal_time: dismissalTime,
            can_drive: driving,
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
