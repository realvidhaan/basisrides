/**
 * Demo override for presenting the app without a real drive.
 *
 * Live trips are driven by GPS: the driver's device broadcasts fixes and every
 * rider's map animates the car from them. That is untestable on a simulator (no
 * GPS, no geofence events) and unimpressive on a stationary phone, so a demo
 * would show a car that never moves.
 *
 * With this flag set the live map synthesises movement along the trip's REAL
 * route instead of waiting for broadcasts. Start the packager with:
 *
 *   npm run demo          # EXPO_PUBLIC_DEMO_MODE=1 expo start
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
