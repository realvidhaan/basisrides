/**
 * ErrorBanner — Inline error message with warning icon.
 * Use above form fields to surface auth or submission errors.
 */
export interface ErrorBannerProps {
  /** Error message text. If null/empty, renders nothing. */
  message?: string | null;
}
