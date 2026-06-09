/**
 * Tracks whether a password-recovery flow is in progress.
 *
 * `supabase.auth.verifyOtp({ type: 'recovery' })` establishes a real session,
 * which makes `onAuthStateChange` fire and would normally switch the app to the
 * main (authenticated) stack. During the reset flow we must stay in the auth
 * stack so the user can reach ResetPassword → PasswordChanged. App.tsx reads
 * this flag and keeps the auth stack mounted while it is true.
 */

type Listener = (recovering: boolean) => void;

let recovering = false;
const listeners = new Set<Listener>();

export function setRecovering(value: boolean): void {
  recovering = value;
  listeners.forEach((listener) => listener(value));
}

export function getRecovering(): boolean {
  return recovering;
}

export function subscribeRecovering(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
