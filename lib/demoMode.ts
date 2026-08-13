/**
 * Demo override for presenting the app with no backend and no real drive.
 *
 * Two problems this solves at once.
 *
 * Live trips are driven by GPS: the driver's device broadcasts fixes and every
 * rider's map animates the car from them. That is untestable on a simulator (no
 * GPS, no geofence events) and unimpressive on a stationary phone, so a demo
 * would show a car that never moves. With this flag set the live map synthesises
 * movement along the trip's REAL route instead of waiting for broadcasts.
 *
 * And a live demo cannot depend on a network, a seeded Supabase project or a
 * second phone. With this flag set, `lib/supabase.ts` swaps the real client for
 * the in-memory fake in `lib/demo/` — a fake that speaks enough PostgREST,
 * Realtime, Auth and Edge Functions for every hook, query string and screen to
 * run its ORDINARY production code path against it. Nothing in `hooks/`,
 * `lib/pairing.ts` or `lib/schoolCalendar.ts` knows the demo exists.
 *
 * Start the packager with:
 *
 *   npm run demo    # EXPO_PUBLIC_DEMO_MODE=1 EXPO_GO=1 expo start --tunnel --go --clear
 *
 * Expo Go is the target: the demo deliberately avoids everything Expo Go cannot
 * do (APNs push tokens, background location, geofences — see the short-circuits
 * in hooks/usePushRegistration, hooks/useLocationSharing and
 * hooks/useTripGeofencing).
 *
 * There is deliberately no in-app control for this — nothing in the UI reveals
 * or toggles it.
 *
 * Read as a full static member expression, never destructured off `process.env`:
 * babel-preset-expo inlines EXPO_PUBLIC_* at bundle time only in that form. With
 * the variable unset this compiles to the literal `false` and the name
 * EXPO_PUBLIC_DEMO_MODE does not appear in the bundle at all — verified against
 * a production bundle. The demo modules are still *shipped* (Metro does not
 * tree-shake them); what the flag guarantees is that they are unreachable —
 * buildDemoRoute is never called and the ticker never creates a timer.
 *
 * IMPORTANT: Metro's transform cache does not key on EXPO_PUBLIC_* values, so
 * switching this on or off without clearing the cache silently keeps the
 * PREVIOUS setting — in both directions. Both `npm start` and `npm run demo`
 * therefore pass --clear; don't remove it.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

/** How long the synthetic car takes to drive the whole route, once. */
export const DEMO_TRIP_MS = 10_000;

/**
 * How often the synthetic driver emits a fix.
 *
 * Keep this EQUAL to the marker's animation duration in LiveMap: the marker
 * eases from each fix to the next over exactly one tick, so the motion is
 * continuous. If the tick is longer than the animation the car arrives early
 * and sits still until the next fix (visible stutter); if it is shorter, each
 * animation is cut off mid-flight and the car lurches.
 */
export const DEMO_TICK_MS = 100;

// ---------------------------------------------------------------------------
// Demo script timing. All of it lives here so a rehearsal can retune the pacing
// in one file instead of hunting through lib/demo/.
// ---------------------------------------------------------------------------

/**
 * Pickup time the fake community falls back to when the presenter has not set a
 * day yet. Matches EditScheduleScreen's DEFAULT_TIME, so the very first screen
 * of the demo already shows a populated, plausible community.
 */
export const DEMO_FALLBACK_PICKUP = '15:15';

/** Silence after the presenter's message before the ••• indicator appears. */
export const DEMO_BOT_THINK_MS = 900;

/** How long ••• shows before the reply lands. */
export const DEMO_BOT_TYPING_MS = 1_200;

/** Gap before an optional second bot line. */
export const DEMO_BOT_FOLLOWUP_MS = 2_400;

/**
 * "A parent needs cover" ambient beat, measured from sign-in.
 *
 * From sign-in, not from launch: the app sits on the Welcome screen until the
 * presenter signs in, and `App.tsx` swaps to the tab navigator the instant the
 * session lands — so sign-in IS "arrived on the Schedule screen", and this is
 * the delay after that.
 *
 * Short on purpose. The point of this beat is that the audience SEES it happen:
 * a banner drops, the swap badge goes 0 → 1, and the board gains a row that was
 * not there a moment ago. Nothing is pre-seeded on the board precisely so the
 * arrival is the whole event — at 45 s it landed long after the presenter had
 * moved on and just looked like state that had always been there.
 *
 * Who asks, and for which day, is in `lib/demo/fixtures.DEMO_AMBIENT_SWAP`.
 */
export const DEMO_AMBIENT_SWAP_MS = 8_000;

/** "Trip complete" ambient beat, measured from the demo arrival. */
export const DEMO_AMBIENT_TRIP_DONE_MS = 1_500;
