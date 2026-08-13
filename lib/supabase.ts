import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { authStorage } from '@/lib/storage';
import { DEMO_MODE } from '@/lib/demoMode';
import { createDemoClient } from '@/lib/demo/client';
import { startDemoScript } from '@/lib/demo/script';

// Exported so the embedded Leaflet map (which runs its own supabase-js inside a
// webview/iframe and subscribes to the live-location broadcast) can reuse them.
// The anon/publishable key is safe to expose by design.
export const SUPABASE_URL = 'https://itfrksemudjaicksfucr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_t3bdDWP4dOgcJWMDNit3Aw_UKBgeTps';

/**
 * The single interception seam for demo mode.
 *
 * With EXPO_PUBLIC_DEMO_MODE unset, `DEMO_MODE` folds to the literal `false` at
 * bundle time and this is byte-for-byte the production client. With it set, the
 * whole app runs its ordinary code path against the in-memory fake in
 * `lib/demo/` — see lib/demoMode.ts. The `unknown` hop is deliberate: the fake
 * implements the parts of the client the app touches, not the full generic
 * PostgrestQueryBuilder surface, so this is the one place the cast lives.
 */
export const supabase: SupabaseClient = DEMO_MODE
  ? (createDemoClient() as SupabaseClient)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Native: encrypted device keychain via expo-secure-store. Web: AsyncStorage
        // (localStorage). See lib/storage for the platform split.
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

// Arms the chat bot and the ambient beats against the fake store. It only
// subscribes here — the beats themselves are measured from sign-in — and in a
// normal build this whole statement folds away with the flag.
if (DEMO_MODE) startDemoScript();

// Deliberately NOT guarded on DEMO_MODE. This runs at module load, before any
// demo code could guard it, so the fake auth object implements
// startAutoRefresh/stopAutoRefresh as no-ops instead. Guarding here as well
// would add a second conditional for no benefit.
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
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password. Try again.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'An account with this email already exists.';
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
