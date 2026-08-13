import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import {
  EMPTY_IMPACT,
  computeImpact,
  isParticipant,
  ridersOf,
  type ImpactTotals,
  type ImpactTrip,
} from '@/lib/impact';
import type { GeoPoint } from '@/types';

interface UseImpactResult {
  totals: ImpactTotals;
  loading: boolean;
}

interface HomeRow {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

let impactChannelSeq = 0;

/**
 * Lifetime carpool impact for one parent, live-synced.
 *
 * Takes the user id as an argument rather than calling useCurrentUser: every
 * screen that wants this already has the id from useCarpool, and a second auth
 * round-trip on the app's first screen is a cost with no payoff.
 *
 * There is deliberately no `error`: the strip is ambient context, not a task.
 * A failed fetch leaves the totals empty, which hides the strip (see
 * ImpactStrip) — quieter and more honest than putting a red banner above the
 * calendar for a statistic nobody asked for. Failures still reach Sentry.
 */
export function useImpact(userId: string | null): UseImpactResult {
  const [totals, setTotals] = useState<ImpactTotals>(EMPTY_IMPACT);
  const [loading, setLoading] = useState(true);

  // Two round-trips per run (trips, then their riders' homes) and no ordering
  // guarantee between runs, so a `userId` change mid-flight lets the older run
  // resolve last and commit the previous account's totals — or clear `loading`
  // while the current run is still going. Stamp each run and let only the
  // newest one write. Same pattern and same reason as useCarpool.ts:84.
  const fetchSeq = useRef(0);

  const fetchImpact = useCallback(async (): Promise<void> => {
    const seq = fetchSeq.current + 1;
    fetchSeq.current = seq;
    const isCurrent = (): boolean => seq === fetchSeq.current;

    if (!userId) {
      setTotals(EMPTY_IMPACT);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Unfiltered by design: `rider_ids` is an array column, so "trips I was in"
      // has no single-column predicate. RLS already scopes SELECT to trips the
      // caller drove or rode in, and computeImpact re-checks participation, so a
      // policy change can loosen what comes back without inflating the numbers.
      const { data, error: tErr } = await supabase
        .from('trips')
        .select('driver_id, rider_ids, status')
        .eq('status', 'completed');
      if (tErr || !data) {
        if (tErr) Sentry.captureException(tErr);
        if (isCurrent()) setTotals(EMPTY_IMPACT);
        return;
      }

      const trips = data as unknown as ImpactTrip[];
      const mine = trips.filter((t) => isParticipant(t, userId));

      // Miles come from where each rider lives, so we need their coordinates.
      // Only riders of the viewer's own trips, to keep the `in()` list short.
      const riderIds = new Set<string>();
      for (const t of mine) for (const id of ridersOf(t)) riderIds.add(id);

      const homeById = new Map<string, GeoPoint>();
      if (riderIds.size > 0) {
        const { data: users, error: uErr } = await supabase
          .from('users')
          .select('id, latitude, longitude')
          .in('id', Array.from(riderIds));
        // Bail rather than continue: miles and CO₂ are computed entirely from
        // these coordinates, so a failed lookup does not make the totals
        // slightly stale — it makes them silently too low, and a number that is
        // quietly wrong is worse than one that is absent. Matches this hook's
        // documented failure behaviour of leaving the totals empty, which hides
        // the strip instead of publishing a figure nobody can trust.
        if (uErr) {
          Sentry.captureException(uErr);
          if (isCurrent()) setTotals(EMPTY_IMPACT);
          return;
        }
        for (const u of (users ?? []) as HomeRow[]) {
          if (u.latitude === null || u.longitude === null) continue;
          homeById.set(u.id, { lat: u.latitude, lng: u.longitude });
        }
      }

      if (isCurrent()) setTotals(computeImpact(mine, homeById, userId));
    } catch (e) {
      Sentry.captureException(e);
      if (isCurrent()) setTotals(EMPTY_IMPACT);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchImpact();
    if (!userId) return;

    // Schedule stays mounted underneath the live-trip screen, so without this
    // the strip would still show yesterday's total after the driver taps
    // "End ride" and navigates back. Cheap: completions are rare events.
    impactChannelSeq += 1;
    const channel = supabase
      .channel(`impact-${impactChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        () => void fetchImpact(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchImpact]);

  return { totals, loading };
}
