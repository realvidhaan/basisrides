import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { registerForPushNotificationsAsync } from '@/lib/push';
import { navigationRef } from '@/lib/navigation';

type NotifData = Record<string, unknown> | undefined;

/**
 * Routes a notification tap to the relevant screen using the data the DB
 * triggers attach (see `notify_on_message` / `notify_on_trip` /
 * `notify_on_pickup`). Retries briefly so a cold-start tap still lands once the
 * navigator is mounted.
 */
function routeFromData(data: NotifData, attempt = 0): void {
  if (!data) return;
  if (!navigationRef.isReady()) {
    if (attempt < 10) setTimeout(() => routeFromData(data, attempt + 1), 400);
    return;
  }
  if (typeof data.conversation_id === 'string') {
    navigationRef.navigate('MessagesTab', {
      screen: 'Conversation',
      params: {
        conversationId: data.conversation_id,
        title:
          typeof data.conversation_title === 'string'
            ? data.conversation_title
            : 'Chat',
      },
    });
  } else if (typeof data.ride_date === 'string') {
    navigationRef.navigate('ScheduleTab', {
      screen: 'LiveTrip',
      params: { date: data.ride_date },
    });
  }
}

/**
 * Registers the signed-in user's Expo push token (upserted into `push_tokens`)
 * and wires notification taps to navigation. No-ops when signed out.
 */
export function usePushRegistration(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      const token = await registerForPushNotificationsAsync();
      if (cancelled || !token) return;
      // SECURITY DEFINER RPC so a device's token row can be (re)claimed by the
      // signed-in user without a permissive table UPDATE policy.
      try {
        await supabase.rpc('register_push_token', {
          p_token: token,
          p_platform: Platform.OS,
        });
      } catch (e) {
        Sentry.captureException(e);
      }
    })();

    // Cold start: app opened by tapping a notification.
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      routeFromData(last.notification.request.content.data as NotifData);
    }
    // Warm taps while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      routeFromData(resp.notification.request.content.data as NotifData);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);
}
