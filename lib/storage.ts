import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * The storage shape Supabase Auth expects for persisting the session.
 */
interface SupabaseAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Native (iOS/Android) auth-token storage backed by the device keychain /
 * encrypted SharedPreferences via expo-secure-store. Tokens survive app updates
 * and force-closes and are encrypted at rest, unlike AsyncStorage's plaintext.
 *
 * Caveat: SecureStore historically rejects values larger than ~2048 bytes on
 * some iOS releases. A normal Supabase session (access + refresh token) fits
 * comfortably, but if you ever enlarge the JWT (many custom claims) and see
 * setItem rejections on iOS, switch this for a chunking "LargeSecureStore"
 * adapter (encrypt with a SecureStore-held key, store the ciphertext in
 * AsyncStorage). We swallow read/delete errors so a missing/invalidated key
 * just reads as "no session" rather than crashing app start.
 */
const ExpoSecureStoreAdapter: SupabaseAuthStorage = {
  getItem: (key) => SecureStore.getItemAsync(key).catch(() => null),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) =>
    SecureStore.deleteItemAsync(key).catch(() => undefined),
};

/**
 * SecureStore only exists on Android/iOS. On web (the Vercel build) there is no
 * keychain, so we keep AsyncStorage, which is localStorage-backed there.
 */
export const authStorage: SupabaseAuthStorage =
  Platform.OS === 'web' ? AsyncStorage : ExpoSecureStoreAdapter;
