import { supabase } from '@/lib/supabase';

/**
 * Sends a BasisRide auth code (email confirmation or password reset) via the
 * `auth-email` Edge Function, which generates the OTP server-side and delivers
 * it through Resend. This replaces Supabase's built-in SMTP path (which was
 * misconfigured). The client still verifies the code with `verifyOtp`:
 *   - 'signup'   → magiclink code, verify with type 'email'
 *   - 'recovery' → recovery code, verify with type 'recovery'
 */
export async function sendAuthEmail(
  type: 'signup' | 'recovery',
  email: string,
  opts?: { password?: string; data?: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('auth-email', {
      body: { type, email: email.trim(), password: opts?.password, data: opts?.data },
    });
    if (error) return { ok: false, error: error.message };
    if (data && (data as { ok?: boolean }).ok === false) {
      return { ok: false, error: (data as { error?: string }).error };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not send the email. Please try again.' };
  }
}
