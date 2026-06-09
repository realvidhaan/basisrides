import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://itfrksemudjaicksfucr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_t3bdDWP4dOgcJWMDNit3Aw_UKBgeTps';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
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
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password. Try again.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'An account with this email already exists.';
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
