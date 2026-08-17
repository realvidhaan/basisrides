import * as Sentry from '@sentry/react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

/**
 * Background geofencing for live trips. With "Always" location permission this
 * fires even when the app is backgrounded or fully killed — iOS relaunches the
 * app to deliver the region event — so a trip auto-starts when the driver
 * reaches school and auto-ends when they get home, with nothing tapped.
 *
 * The task can't be handed React state, so the active trip context (driver,
 * date, riders) is persisted to AsyncStorage by `setGeofenceContext`. The DB
 * writes mirror `useTrip.startTrip` / `setStatus` exactly and are idempotent, so
 * a foreground watcher and this task firing for the same event is harmless.
 */
export const GEOFENCE_TASK = 'ridr-trip-geofence';
export const PICKUP_REGION_ID = 'bsr-pickup';
export const HOME_REGION_ID = 'bsr-home';

const CONTEXT_KEY = 'ridr.geofenceContext';
// Once the driver is confirmed away from home for a given trip, this holds that
// trip's `${driverId}|${iso}` key. The home geofence only auto-ends a trip whose
// key is armed here, so iOS's initial-state Enter (delivered when geofencing
// (re)starts while the device is already inside the home region — e.g. after an
// app restart) can't complete a trip the driver hasn't actually run yet.
const ARMED_KEY = 'ridr.geofenceArmed';

export interface GeofenceContext {
  driverId: string;
  iso: string;
  riderIds: string[];
}

function tripKey(ctx: GeofenceContext): string {
  return `${ctx.driverId}|${ctx.iso}`;
}

/** Persist (or clear) which trip the geofence task should act on. */
export async function setGeofenceContext(ctx: GeofenceContext | null): Promise<void> {
  if (ctx) {
    // Preserve any existing armed flag: re-registering the same trip (e.g. on an
    // app restart) must not disarm it. A stale flag for a different trip is
    // harmless because isArmed() compares the trip key.
    await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
  } else {
    await AsyncStorage.multiRemove([CONTEXT_KEY, ARMED_KEY]);
  }
}

async function getGeofenceContext(): Promise<GeofenceContext | null> {
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GeofenceContext;
  } catch {
    return null;
  }
}

/** Mark this trip as "driver has left home", enabling the home auto-end. */
async function armEnd(ctx: GeofenceContext): Promise<void> {
  await AsyncStorage.setItem(ARMED_KEY, tripKey(ctx));
}

/** Whether the home auto-end has been armed for this specific trip. */
async function isArmed(ctx: GeofenceContext): Promise<boolean> {
  return (await AsyncStorage.getItem(ARMED_KEY)) === tripKey(ctx);
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = (data ?? {}) as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  const ctx = await getGeofenceContext();
  if (!ctx) return;

  try {
    // Leaving home proves the driver is actually out on the run, so arm the
    // auto-end. iOS only delivers Exit after a genuine departure, never as an
    // initial-registration event.
    if (
      region?.identifier === HOME_REGION_ID &&
      eventType === Location.GeofencingEventType.Exit
    ) {
      await armEnd(ctx);
      return;
    }

    if (eventType !== Location.GeofencingEventType.Enter) return;

    if (region.identifier === PICKUP_REGION_ID) {
      // Reaching school means the driver is away from home — arm the auto-end.
      await armEnd(ctx);
      // Auto-start — idempotent upsert, identical to useTrip.startTrip.
      await supabase.from('trips').upsert(
        {
          driver_id: ctx.driverId,
          ride_date: ctx.iso,
          rider_ids: ctx.riderIds,
          status: 'on_my_way',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'driver_id,ride_date' },
      );
    } else if (region.identifier === HOME_REGION_ID) {
      // Auto-end, but only once the driver has been confirmed away from home for
      // this trip (see ARMED_KEY). This blocks iOS's initial-state Enter — fired
      // when geofencing (re)starts while the device is already home, e.g. after an
      // app restart — from completing a trip the instant it registers.
      if (!(await isArmed(ctx))) return;
      await supabase
        .from('trips')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('driver_id', ctx.driverId)
        .eq('ride_date', ctx.iso)
        .eq('status', 'on_my_way');
    }
  } catch (e) {
    Sentry.captureException(e);
    // A dropped write is non-fatal — the driver still has manual controls.
  }
});
