import * as Sentry from '@sentry/react-native';

/**
 * Provider-agnostic product analytics.
 *
 * For a startup you need to see ACTIVATION (signup → first completed trip) and
 * RETENTION (do families come back?). Sentry covers crashes, not funnels.
 *
 * This module is the single seam for a real analytics provider. Today it emits
 * Sentry breadcrumbs (so events show up as context on errors) — enough to wire
 * up the call sites without adding a dependency before launch. To switch to
 * PostHog/Amplitude later, install the SDK and forward `track`/`identify` here;
 * every call site below keeps working unchanged.
 *
 *   // e.g. PostHog:
 *   // import PostHog from 'posthog-react-native';
 *   // const posthog = new PostHog(KEY, { host });
 *   // export function track(event, props) { posthog.capture(event, props); ... }
 */

export type AnalyticsEvent =
  | 'signup_completed'
  | 'login_completed'
  | 'trip_completed'
  | 'carpool_matched_viewed';

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({
      category: 'analytics',
      type: 'user',
      level: 'info',
      message: event,
      data: props,
    });
  } catch {
    // Analytics must never break a user flow.
  }
}

/** Associate subsequent events with a user. No-op stub until a provider is wired. */
export function identify(userId: string, traits?: Record<string, unknown>): void {
  try {
    Sentry.setUser({ id: userId });
    if (traits) Sentry.addBreadcrumb({ category: 'analytics', message: 'identify', data: traits });
  } catch {
    // ignore
  }
}
