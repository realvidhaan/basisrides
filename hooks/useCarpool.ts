import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cityZone } from '@/lib/zones';
import { toISO } from '@/lib/dateUtils';
import {
  createRotationEngine,
  type Participant,
  type UserAssignment,
} from '@/lib/pairing';
import type { WeekdayKey } from '@/types';

const HARDSHIP_LIMIT = 2;

interface RawParticipantRow {
  user_id: string;
  day_of_week: string;
  dismissal_time: string | null;
  can_drive: boolean | null;
  user: {
    full_name: string;
    neighborhood: string;
    car_capacity: number;
  } | null;
}

interface RawHardshipRow {
  user_id: string;
  pass_date: string;
}

// Unique realtime topic per hook instance (Day 2 fix pattern).
let channelSeq = 0;

export interface UseCarpoolResult {
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  assignmentFor: (date: Date) => UserAssignment | null;
  hasPass: (date: Date) => boolean;
  passesLeftThisMonth: (date: Date) => number;
  takePass: (date: Date) => Promise<void>;
  dropPass: (date: Date) => Promise<void>;
}

/**
 * Loads the whole community's participating schedules + hardship passes and
 * computes each day's fair driver rotation on the client (deterministic). Live
 * via realtime on availability + hardship_passes. Also exposes the current
 * user's hardship-pass actions.
 */
export function useCarpool(): UseCarpoolResult {
  const { user } = useCurrentUser();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [hardship, setHardship] = useState<Set<string>>(new Set());
  const [myPassDates, setMyPassDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;

  const fetchAll = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) setLoading(true);
      try {
        const [partRes, hpRes] = await Promise.all([
          supabase
            .from('availability')
            .select(
              'user_id, day_of_week, dismissal_time, can_drive,' +
                ' user:users!availability_user_id_fkey(full_name,neighborhood,car_capacity)',
            )
            .eq('participating', true),
          supabase.from('hardship_passes').select('user_id, pass_date'),
        ]);

        if (partRes.error) {
          setError(mapSupabaseError(partRes.error));
          return;
        }
        if (hpRes.error) {
          setError(mapSupabaseError(hpRes.error));
          return;
        }

        const partRows = (partRes.data ?? []) as unknown as RawParticipantRow[];
        const next: Participant[] = [];
        for (const row of partRows) {
          if (!row.user || !row.dismissal_time) continue;
          next.push({
            userId: row.user_id,
            name: row.user.full_name,
            weekday: row.day_of_week as WeekdayKey,
            time: row.dismissal_time.slice(0, 5),
            zone: cityZone(row.user.neighborhood),
            capacity: row.user.car_capacity,
            canDrive: Boolean(row.can_drive),
          });
        }

        const hpRows = (hpRes.data ?? []) as unknown as RawHardshipRow[];
        const set = new Set<string>();
        const mine: string[] = [];
        for (const hp of hpRows) {
          set.add(`${hp.user_id}|${hp.pass_date}`);
          if (hp.user_id === uid) mine.push(hp.pass_date);
        }

        setParticipants(next);
        setHardship(set);
        setMyPassDates(mine);
        setError(null);
      } catch {
        setError('Something went wrong loading carpools. Please try again.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [uid],
  );

  useEffect(() => {
    void fetchAll(false);

    channelSeq += 1;
    const channel = supabase
      .channel(`carpool-${channelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        () => void fetchAll(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hardship_passes' },
        () => void fetchAll(true),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  // One engine per data snapshot; it memoizes per-date results internally and
  // carries cumulative drive history for the even-out rotation.
  const engine = useMemo(
    () => createRotationEngine(participants, hardship),
    [participants, hardship],
  );

  const assignmentFor = useCallback(
    (date: Date): UserAssignment | null => {
      if (!uid) return null;
      return engine.assignmentsFor(date).get(uid) ?? null;
    },
    [engine, uid],
  );

  const hasPass = useCallback(
    (date: Date): boolean => myPassDates.includes(toISO(date)),
    [myPassDates],
  );

  const passesLeftThisMonth = useCallback(
    (date: Date): number => {
      const prefix = toISO(date).slice(0, 7); // YYYY-MM
      const used = myPassDates.filter((d) => d.startsWith(prefix)).length;
      return Math.max(0, HARDSHIP_LIMIT - used);
    },
    [myPassDates],
  );

  const takePass = useCallback(
    async (date: Date): Promise<void> => {
      if (!user) {
        setError('You must be signed in.');
        return;
      }
      const iso = toISO(date);
      setError(null);
      try {
        const { error: insErr } = await supabase
          .from('hardship_passes')
          .insert({ user_id: user.id, pass_date: iso });
        if (insErr) {
          setError(
            /limit/i.test(insErr.message)
              ? 'You have used both hardship passes this month.'
              : mapSupabaseError(insErr),
          );
          return;
        }
        await fetchAll(true);
      } catch {
        setError('Could not use a hardship pass. Please try again.');
      }
    },
    [user, fetchAll],
  );

  const dropPass = useCallback(
    async (date: Date): Promise<void> => {
      if (!user) return;
      const iso = toISO(date);
      setError(null);
      try {
        const { error: delErr } = await supabase
          .from('hardship_passes')
          .delete()
          .eq('user_id', user.id)
          .eq('pass_date', iso);
        if (delErr) {
          setError(mapSupabaseError(delErr));
          return;
        }
        await fetchAll(true);
      } catch {
        setError('Could not undo the hardship pass. Please try again.');
      }
    },
    [user, fetchAll],
  );

  return {
    loading,
    error,
    currentUserId: uid,
    assignmentFor,
    hasPass,
    passesLeftThisMonth,
    takePass,
    dropPass,
  };
}
