import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';

/**
 * Creates an immediately-usable account (no email confirmation). The
 * `create-account` Edge Function uses admin.createUser(email_confirm:true), so
 * no verification email is sent and the client can sign in right away. Profile
 * fields are passed as `data` for the handle_new_user trigger.
 */
export async function createAccount(
  email: string,
  password: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: res, error } = await supabase.functions.invoke('create-account', {
      body: { email: email.trim(), password, data },
    });
    if (error) {
      Sentry.captureException(error);
      return { ok: false, error: error.message };
    }
    if (res && (res as { ok?: boolean }).ok === false) {
      return {
        ok: false,
        error:
          (res as { error?: string }).error ??
          'Could not create your account. Please try again.',
      };
    }
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e);
    return { ok: false, error: 'Could not create your account. Please try again.' };
  }
}

/**
 * Permanently deletes the signed-in user's account (Apple Guideline 5.1.1(v)).
 * The `delete-account` Edge Function authenticates the caller from their JWT and
 * hard-deletes their auth user with the service role, cascading to their profile
 * and app data. The caller must sign out afterward.
 */
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: res, error } = await supabase.functions.invoke('delete-account', {
      body: {},
    });
    if (error) {
      Sentry.captureException(error);
      return { ok: false, error: error.message };
    }
    if (res && (res as { ok?: boolean }).ok === false) {
      return {
        ok: false,
        error:
          (res as { error?: string }).error ??
          'Could not delete your account. Please try again.',
      };
    }
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e);
    return { ok: false, error: 'Could not delete your account. Please try again.' };
  }
}
