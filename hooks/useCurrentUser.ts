import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types';

interface UseCurrentUserResult {
  user: UserProfile | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Loads the logged-in user's profile row from the `users` table.
 * Returns null (not an error) if there is no session or the row is missing —
 * callers render an inline empty state rather than crashing.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user.id;
      if (!uid) {
        setUser(null);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

      if (error || !data) {
        setUser(null);
        return;
      }

      setUser(data as UserProfile);
    } catch (e) {
      Sentry.captureException(e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchUser();
      if (!active) {
        // Component unmounted mid-fetch; state setters above are no-ops in React 19
        // but we keep the guard explicit for clarity.
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchUser]);

  return { user, loading, refetch: fetchUser };
}
