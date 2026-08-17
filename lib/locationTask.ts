import * as TaskManager from 'expo-task-manager';
import type * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { LOC_EVENT, type LocPayload } from '@/lib/liveTrip';

/**
 * Background location task. `expo-location`'s `startLocationUpdatesAsync` keeps
 * delivering fixes here even when the app is backgrounded mid-trip (iOS shows
 * the blue location indicator), so the driver's car keeps moving on riders'
 * maps after the phone locks.
 *
 * The task can't be handed arbitrary data, so the active trip's broadcast
 * channel name is persisted to AsyncStorage by `setActiveTripChannel` and read
 * back on each invocation. Broadcast stays ephemeral — nothing is written to
 * the DB.
 */
export const LOCATION_TASK = 'ridr-live-location';
const ACTIVE_CHANNEL_KEY = 'ridr.activeTripChannel';

// Cache one subscribed channel across task invocations to avoid re-subscribing
// on every GPS fix.
let cachedName: string | null = null;
let cachedChannel: RealtimeChannel | null = null;

async function channelFor(name: string): Promise<RealtimeChannel> {
  if (cachedChannel && cachedName === name) return cachedChannel;
  if (cachedChannel) await supabase.removeChannel(cachedChannel);
  const ch = supabase.channel(name);
  ch.subscribe();
  cachedChannel = ch;
  cachedName = name;
  return ch;
}

/** Set (or clear) which trip channel the background task should broadcast on. */
export async function setActiveTripChannel(name: string | null): Promise<void> {
  if (name) {
    await AsyncStorage.setItem(ACTIVE_CHANNEL_KEY, name);
    return;
  }
  await AsyncStorage.removeItem(ACTIVE_CHANNEL_KEY);
  if (cachedChannel) {
    await supabase.removeChannel(cachedChannel);
    cachedChannel = null;
    cachedName = null;
  }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | null)?.locations;
  if (!locations || locations.length === 0) return;

  const name = await AsyncStorage.getItem(ACTIVE_CHANNEL_KEY);
  if (!name) return;

  const loc = locations[locations.length - 1];
  const payload: LocPayload = {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    heading: loc.coords.heading ?? null,
  };

  try {
    const ch = await channelFor(name);
    await ch.send({ type: 'broadcast', event: LOC_EVENT, payload });
  } catch {
    // A dropped fix is harmless — the next one will carry the latest position.
  }
});
