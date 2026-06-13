import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { authStorage } from '@/lib/storage';

// Exported so the embedded Leaflet map (which runs its own supabase-js inside a
// webview/iframe and subscribes to the live-location broadcast) can reuse them.
// The anon/publishable key is safe to expose by design.
export const SUPABASE_URL = 'https://itfrksemudjaicksfucr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_t3bdDWP4dOgcJWMDNit3Aw_UKBgeTps';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Native: encrypted device keychain via expo-secure-store. Web: AsyncStorage
    // (localStorage). See lib/storage for the platform split.
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export function mapSupabaseError(error: { message: string } | null): string {
  if (!error) return '';
  const msg = error.message.toLowerCase();
  if (msg.includes('not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password. Try again.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (
    msg.includes('otp') ||
    msg.includes('token') ||
    msg.includes('expired')
  ) {
    return 'Code expired or incorrect. Please request a new one.';
  }
  if (
    msg.includes('same password') ||
    msg.includes('should be different') ||
    msg.includes('different from the old')
  ) {
    return 'New password must be different from your current password.';
  }
  if (msg.includes('at least') && msg.includes('character')) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('sending') && msg.includes('email')) {
    return 'We could not send the email right now. Please try again shortly.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch')
  ) {
    return 'Connection error. Check your internet.';
  }
  return 'Something went wrong. Please try again.';
}
