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
export const GEOFENCE_TASK = 'basisride-trip-geofence';
export const PICKUP_REGION_ID = 'bsr-pickup';
export const HOME_REGION_ID = 'bsr-home';

const CONTEXT_KEY = 'basisride.geofenceContext';

export interface GeofenceContext {
  driverId: string;
  iso: string;
  riderIds: string[];
}

/** Persist (or clear) which trip the geofence task should act on. */
export async function setGeofenceContext(ctx: GeofenceContext | null): Promise<void> {
  if (ctx) {
    await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
  } else {
    await AsyncStorage.removeItem(CONTEXT_KEY);
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

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = (data ?? {}) as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  if (eventType !== Location.GeofencingEventType.Enter) return;

  const ctx = await getGeofenceContext();
  if (!ctx) return;

  try {
    if (region.identifier === PICKUP_REGION_ID) {
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
      // Auto-end — only completes a trip that's currently in progress.
      await supabase
        .from('trips')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('driver_id', ctx.driverId)
        .eq('ride_date', ctx.iso)
        .eq('status', 'on_my_way');
    }
  } catch {
    // A dropped write is non-fatal — the driver still has manual controls.
  }
});
