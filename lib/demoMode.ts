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
 * the variable unset this folds to the literal `false`, so every demo code path
 * is dead code in a normal build.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

/** Seconds for the synthetic car to traverse the whole route, once. */
export const DEMO_TRIP_SECONDS = 90;

/** How often the synthetic driver emits a fix, in ms. */
export const DEMO_TICK_MS = 1000;
