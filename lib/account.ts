import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';

/**
 * Creates an immediately-usable account for v1 (no email confirmation). The
 * `create-account` Edge Function uses admin.createUser(email_confirm:true), so
 * no verification email is sent and the client can sign in right away. Profile
 * fields are passed as `data` for the handle_new_user trigger.
 *
 * Email verification can be reintroduced later (the auth-email function, Vault
 * key, and DMARC record all remain in place) once the sending domain is warm.
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
