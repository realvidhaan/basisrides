import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface SwapView {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterZone: string;
  day: string; // ISO 'YYYY-MM-DD'
  note: string | null;
  status: 'open' | 'filled' | 'cancelled';
  acceptedBy: string | null;
}

interface RawSwapRow {
  id: string;
  requester_id: string;
  day: string;
  note: string | null;
  status: 'open' | 'filled' | 'cancelled';
  accepted_by: string | null;
  requester: { full_name: string; neighborhood: string } | null;
}

interface UseSwapsResult {
  openRequests: SwapView[]; // others' open requests you could cover
  myRequests: SwapView[]; // requests you created
  openCount: number;
  loading: boolean;
  error: string | null;
  requestCover: (iso: string, note: string) => Promise<boolean>;
  cancelSwap: (id: string) => Promise<void>;
  acceptSwap: (id: string) => Promise<void>;
}

let swapsChannelSeq = 0;

function toView(r: RawSwapRow): SwapView {
  return {
    id: r.id,
    requesterId: r.requester_id,
    requesterName: r.requester?.full_name ?? 'A parent',
    requesterZone: r.requester?.neighborhood ?? '',
    day: r.day,
    note: r.note,
    status: r.status,
    acceptedBy: r.accepted_by,
  };
}

/**
 * The cover-request board: others' open requests you can cover, plus your own
 * requests. Live via realtime. Accepting goes through the accept_swap RPC (it
 * needs to write another parent's row, which RLS forbids directly).
 */
export function useSwaps(): UseSwapsResult {
  const { user } = useCurrentUser();
  const [openRequests, setOpenRequests] = useState<SwapView[]>([]);
  const [myRequests, setMyRequests] = useState<SwapView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;

  const fetchSwaps = useCallback(async (): Promise<void> => {
    if (!uid) {
      setOpenRequests([]);
      setMyRequests([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: fErr } = await supabase
        .from('swaps')
        .select(
          'id, requester_id, day, note, status, accepted_by,' +
            ' requester:users!swaps_requester_id_fkey(full_name, neighborhood)',
        )
        .or(`status.eq.open,requester_id.eq.${uid}`)
        .order('day', { ascending: true });
      if (fErr) {
        setError('Could not load cover requests. Please try again.');
        return;
      }
      const rows = (data ?? []) as unknown as RawSwapRow[];
      const views = rows.map(toView);
      setOpenRequests(
        views.filter((v) => v.status === 'open' && v.requesterId !== uid),
      );
      setMyRequests(views.filter((v) => v.requesterId === uid));
      setError(null);
    } catch {
      setError('Could not load cover requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void fetchSwaps();
    if (!uid) return;

    swapsChannelSeq += 1;
    const channel = supabase
      .channel(`swaps-${swapsChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swaps' },
        () => void fetchSwaps(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, fetchSwaps]);

  const requestCover = useCallback(
    async (iso: string, note: string): Promise<boolean> => {
      if (!uid) return false;
      setError(null);
      try {
        const { error: iErr } = await supabase
          .from('swaps')
          .insert({
            requester_id: uid,
            day: iso,
            note: note.trim() || null,
            status: 'open',
          });
        if (iErr) {
          // A duplicate open request for the same day is fine — treat as success.
          if (/duplicate|unique/i.test(iErr.message)) return true;
          Sentry.captureException(iErr);
          setError('Could not post your cover request. Please try again.');
          return false;
        }
        await fetchSwaps();
        return true;
      } catch (e) {
        Sentry.captureException(e);
        setError('Could not post your cover request. Please try again.');
        return false;
      }
    },
    [uid, fetchSwaps],
  );

  const cancelSwap = useCallback(
    async (id: string): Promise<void> => {
      if (!uid) return;
      setError(null);
      try {
        const { error: uErr } = await supabase
          .from('swaps')
          .update({ status: 'cancelled' })
          .eq('id', id)
          .eq('requester_id', uid);
        if (uErr) {
          Sentry.captureException(uErr);
          setError('Could not cancel. Please try again.');
        } else await fetchSwaps();
      } catch (e) {
        Sentry.captureException(e);
        setError('Could not cancel. Please try again.');
      }
    },
    [uid, fetchSwaps],
  );

  const acceptSwap = useCallback(
    async (id: string): Promise<void> => {
      Sentry.captureMessage(`Swap acceptance flow started for swap ${id}`, 'info');
      setError(null);
      try {
        const { error: rErr } = await supabase.rpc('accept_swap', {
          p_swap_id: id,
        });
        if (rErr) {
          Sentry.captureException(rErr);
          setError(
            /car/i.test(rErr.message)
              ? 'You need a car (set seats in Profile) to cover a drive.'
              : 'Could not cover this drive. It may already be taken.',
          );
        } else {
          await fetchSwaps();
        }
      } catch (e) {
        Sentry.captureException(e);
        setError('Could not cover this drive. Please try again.');
      }
    },
    [fetchSwaps],
  );

  return {
    openRequests,
    myRequests,
    openCount: openRequests.length,
    loading,
    error,
    requestCover,
    cancelSwap,
    acceptSwap,
  };
}
