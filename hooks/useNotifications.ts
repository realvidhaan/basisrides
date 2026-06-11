import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { AppNotification } from '@/types';

interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAllRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

let notifChannelSeq = 0;

/**
 * The signed-in user's in-app notification feed, kept live via realtime. Rows
 * are created only by SECURITY DEFINER triggers (new message, trip status,
 * pickup) and the redeem_invite RPC, so this hook is read + mark-as-read only.
 */
export function useNotifications(): UseNotificationsResult {
  const { user } = useCurrentUser();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;

  const fetchNotifications = useCallback(async (): Promise<void> => {
    if (!uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: nErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100);
      if (nErr) {
        setError('Could not load notifications. Please try again.');
        return;
      }
      setNotifications((data ?? []) as AppNotification[]);
      setError(null);
    } catch {
      setError('Could not load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void fetchNotifications();
    if (!uid) return;

    notifChannelSeq += 1;
    const channel = supabase
      .channel(`notifications-${notifChannelSeq}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        () => void fetchNotifications(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, fetchNotifications]);

  const markAllRead = useCallback(async (): Promise<void> => {
    if (!uid) return;
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', uid)
        .is('read_at', null);
    } catch {
      // Non-fatal: the badge clears on next fetch.
    }
  }, [uid]);

  const unreadCount = notifications.filter((n) => n.read_at === null).length;

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAllRead,
    refetch: fetchNotifications,
  };
}
