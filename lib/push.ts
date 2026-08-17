import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { colors } from '@/constants/theme/colors';

/**
 * Push-notification setup. Foreground notifications still surface a banner so a
 * driver/rider sees a carpool update without leaving the app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Requests notification permission and returns the device's Expo push token, or
 * `null` if unavailable (permission denied, web, or the iOS Simulator — which
 * has no APNs). Safe to call on every sign-in.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // The whole body is guarded: the channel/permission calls can also reject
  // (no notifications module in a bare Simulator build, permission prompt
  // dismissed by the OS), and the caller only `void`s this promise — an escaped
  // rejection surfaces as a red LogBox warning over the app at launch.
  try {
    // Android needs a channel before the OS will surface the permission prompt.
    // Once a channel exists on-device, Android ignores updates to most of its
    // visual properties (lightColor included) — a real device wouldn't just
    // pick up this teal value by re-running the app. It's still correct here
    // because the Ridr rebrand also changed the Android package name
    // (com.vidhaan.basisride -> com.vidhaan.ridr), which Android treats as a
    // different app: no prior 'default' channel exists to collide with, so
    // this creates it fresh with the new color. A future channel-property
    // change *without* a package rename would need a new channel id instead.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Carpool alerts',
        importance: Notifications.AndroidImportance.MAX,
        lightColor: colors.brandTeal,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    // No APNs on the Simulator / permission or token call failed — non-fatal.
    return null;
  }
}
