import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Thin, fire-and-forget wrapper around expo-haptics for the native apps.
 *
 * - No-ops on web (a carpool web tab has no use for vibration, and this keeps
 *   the helper side-effect-free in the Vercel build).
 * - Never throws: haptics are a nicety, so a device that can't vibrate (Low
 *   Power Mode, disabled Taptic Engine, no hardware) must not break the action
 *   that triggered it.
 */
export function impact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
): void {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(style).catch(() => undefined);
}
