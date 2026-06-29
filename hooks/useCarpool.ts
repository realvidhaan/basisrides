import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cityZone } from '@/lib/zones';
import { toISO } from '@/lib/dateUtils';
import {
  blockKey,
  createRotationEngine,
  type Participant,
  type UserAssignment,
} from '@/lib/pairing';
import type { WeekdayKey } from '@/types';

interface RawParticipantRow {
  user_id: string;
  day_of_week: string;
  dismissal_time: string | null;
  can_drive: boolean | null;
  user: {
    full_name: string;
    neighborhood: string;
    car_capacity: number;
    car_color: string | null;
    car_type: string | null;
    car_model: string | null;
    license_plate: string | null;
    address: string | null;
  } | null;
}

interface RawSkipRow {
  user_id: string;
  skip_date: string;
}

interface RawSwapRow {
  requester_id: string;
  accepted_by: string | null;
  day: string;
  status: string;
}

// Unique realtime topic per hook instance (Day 2 fix pattern).
let channelSeq = 0;

export interface UseCarpoolResult {
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  assignmentFor: (date: Date) => UserAssignment | null;
  hasSkip: (date: Date) => boolean;
  takeSkip: (date: Date) => Promise<void>;
  dropSkip: (date: Date) => Promise<void>;
}

/**
 * Loads the whole community's participating schedules and computes each day's
 * fair driver rotation on the client (deterministic). Live via realtime on
 * availability, schedule_skips, and swaps. Also exposes skip actions.
 */
export function useCarpool(): UseCarpoolResult {
  const { user } = useCurrentUser();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [skips, setSkips] = useState<Set<string>>(new Set());
  const [mySkipDates, setMySkipDates] = useState<string[]>([]);
  const [coverOff, setCoverOff] = useState<Set<string>>(new Set());
  const [coverForce, setCoverForce] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;

  const fetchAll = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) setLoading(true);
      try {
        const [partRes, skipRes, swapRes, blockRes] = await Promise.all([
          supabase
            .from('availability')
            .select(
              'user_id, day_of_week, dismissal_time, can_drive,' +
                ' user:users!availability_user_id_fkey(full_name,neighborhood,car_capacity,' +
                'car_color,car_type,car_model,license_plate,address)',
            )
            .eq('participating', true),
          supabase.from('schedule_skips').select('user_id, skip_date'),
          supabase
            .from('swaps')
            .select('requester_id, accepted_by, day, status')
            .eq('status', 'filled'),
          // Community-wide block pairs (existence only, no direction/reason) so
          // the deterministic engine keeps blocked users out of the same car.
          supabase.rpc('community_blocked_pairs'),
        ]);

        if (partRes.error) {
          setError(mapSupabaseError(partRes.error));
          return;
        }
        if (skipRes.error) {
          setError(mapSupabaseError(skipRes.error));
          return;
        }
        if (swapRes.error) {
          setError(mapSupabaseError(swapRes.error));
          return;
        }
        if (blockRes.error) {
          // Non-fatal: message-level blocking still holds server-side; only
          // carpool co-assignment separation degrades without the pairs, so log
          // and continue rather than failing the whole schedule view.
          Sentry.captureException(blockRes.error);
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
            car: {
              color: row.user.car_color,
              type: row.user.car_type,
              model: row.user.car_model,
              plate: row.user.license_plate,
            },
            address: row.user.address,
          });
        }

        const skipRows = (skipRes.data ?? []) as unknown as RawSkipRow[];
        const skipSet = new Set<string>();
        const mineSkips: string[] = [];
        for (const s of skipRows) {
          skipSet.add(`${s.user_id}|${s.skip_date}`);
          if (s.user_id === uid) mineSkips.push(s.skip_date);
        }

        // Filled cover requests: the requester is relieved of driving that day,
        // the accepter is signed up to drive it.
        const swapRows = (swapRes.data ?? []) as unknown as RawSwapRow[];
        const offSet = new Set<string>();
        const forceSet = new Set<string>();
        for (const sw of swapRows) {
          offSet.add(`${sw.requester_id}|${sw.day}`);
          if (sw.accepted_by) forceSet.add(`${sw.accepted_by}|${sw.day}`);
        }

        const blockRows = (blockRes.data ?? []) as { user_a: string; user_b: string }[];
        const blockSet = new Set<string>();
        for (const bp of blockRows) blockSet.add(blockKey(bp.user_a, bp.user_b));

        setParticipants(next);
        setSkips(skipSet);
        setMySkipDates(mineSkips);
        setCoverOff(offSet);
        setCoverForce(forceSet);
        setBlocked(blockSet);
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

    // Coalesce realtime bursts: during a pickup window many availability/skip/
    // swap rows change in quick succession, and each change would otherwise
    // trigger a full 3-table refetch on every subscribed client. Debounce so a
    // burst collapses into a single refetch (~1s later — within tolerance),
    // cutting redundant DB compute + egress at peak.
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = (): void => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => {
        refetchTimer = null;
        void fetchAll(true);
      }, 800);
    };

    channelSeq += 1;
    const channel = supabase
      .channel(`carpool-${channelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_skips' },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swaps' },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks' },
        scheduleRefetch,
      )
      .subscribe();

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  // One engine per data snapshot; it memoizes per-date results internally and
  // carries cumulative drive history for the even-out rotation.
  const engine = useMemo(
    () => createRotationEngine(participants, skips, coverOff, coverForce, blocked),
    [participants, skips, coverOff, coverForce, blocked],
  );

  const assignmentFor = useCallback(
    (date: Date): UserAssignment | null => {
      if (!uid) return null;
      return engine.assignmentsFor(date).get(uid) ?? null;
    },
    [engine, uid],
  );

  const hasSkip = useCallback(
    (date: Date): boolean => mySkipDates.includes(toISO(date)),
    [mySkipDates],
  );

  const takeSkip = useCallback(
    async (date: Date): Promise<void> => {
      if (!user) {
        setError('You must be signed in.');
        return;
      }
      const iso = toISO(date);
      setError(null);
      try {
        const { error: insErr } = await supabase
          .from('schedule_skips')
          .insert({ user_id: user.id, skip_date: iso });
        // A duplicate (already skipped — double-tap or another device) means the
        // desired state already holds, so treat it as success rather than an error.
        if (insErr && insErr.code !== '23505') {
          Sentry.captureException(insErr);
          setError(mapSupabaseError(insErr));
          return;
        }
        await fetchAll(true);
      } catch (e) {
        Sentry.captureException(e);
        setError('Could not update this day. Please try again.');
      }
    },
    [user, fetchAll],
  );

  const dropSkip = useCallback(
    async (date: Date): Promise<void> => {
      if (!user) return;
      const iso = toISO(date);
      setError(null);
      try {
        const { error: delErr } = await supabase
          .from('schedule_skips')
          .delete()
          .eq('user_id', user.id)
          .eq('skip_date', iso);
        if (delErr) {
          Sentry.captureException(delErr);
          setError(mapSupabaseError(delErr));
          return;
        }
        await fetchAll(true);
      } catch (e) {
        Sentry.captureException(e);
        setError('Could not update this day. Please try again.');
      }
    },
    [user, fetchAll],
  );

  return {
    loading,
    error,
    currentUserId: uid,
    assignmentFor,
    hasSkip,
    takeSkip,
    dropSkip,
  };
}
