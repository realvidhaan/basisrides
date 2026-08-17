import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { GeoPoint, MapStop, ScheduleStackParamList } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { DriverVehicleCard } from '@/components/ui/DriverVehicleCard';
import { LiveMap } from '@/components/map/LiveMap';
import { useCarpool } from '@/hooks/useCarpool';
import { useTrip } from '@/hooks/useTrip';
import { useLocationSharing } from '@/hooks/useLocationSharing';
import { useTripGeofencing } from '@/hooks/useTripGeofencing';
import { supabase } from '@/lib/supabase';
import { SCHOOL } from '@/lib/places';
import { tripLocChannel } from '@/lib/liveTrip';
import { track } from '@/lib/analytics';
import { impact } from '@/lib/haptics';
import { formatDayLabel, formatTime, parseISO } from '@/lib/dateUtils';
import { notifyDemoTripComplete } from '@/lib/demo/script';
import { colors } from '@/constants/theme/colors';

type Nav = StackNavigationProp<ScheduleStackParamList, 'LiveTrip'>;
type Rt = RouteProp<ScheduleStackParamList, 'LiveTrip'>;

interface Props {
  navigation: Nav;
  route: Rt;
}

interface CarUserRow {
  id: string;
  full_name: string;
  child_name: string;
  latitude: number | null;
  longitude: number | null;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Map gets the lion's share of the screen; clamp so it stays reasonable.
const MAP_HEIGHT = Math.min(
  560,
  Math.max(380, Math.round(Dimensions.get('window').height * 0.52)),
);

export function LiveTripScreen({ navigation, route }: Props) {
  const iso = route.params.date;
  const date = parseISO(iso);
  const { currentUserId, assignmentFor, loading: carpoolLoading } = useCarpool();
  const a = assignmentFor(date);

  const isDriver = a?.role === 'drive';
  const driverId = isDriver ? currentUserId : (a?.driver?.userId ?? null);

  const {
    trip,
    pickups,
    loading: tripLoading,
    error,
    setStatus,
    startTrip,
    togglePickup,
  } = useTrip(driverId, iso);

  // useTrip short-circuits to loading=false while driverId is still null, so on
  // its own it would let the "No live trip" card render for the whole duration
  // of the carpool fetch. Gate on both.
  const loading = carpoolLoading || tripLoading;

  // The driver shares GPS only while the ride is active (started, not ended).
  const sharingActive = isDriver && trip?.status === 'on_my_way';
  const channelName = driverId ? tripLocChannel(driverId, iso) : 'noop';
  const { error: shareError } = useLocationSharing(sharingActive, channelName);

  // Fetch the car's members so we can pin homes on the map + list riders.
  const [carUsers, setCarUsers] = useState<CarUserRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const memberIds = useMemo(() => {
    if (!a) return [];
    const ids = new Set<string>();
    if (a.driver) ids.add(a.driver.userId);
    if (isDriver && currentUserId) ids.add(currentUserId);
    for (const r of a.riders) ids.add(r.userId);
    return Array.from(ids);
  }, [a, isDriver, currentUserId]);

  useEffect(() => {
    let active = true;
    if (memberIds.length === 0) {
      setCarUsers([]);
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, full_name, child_name, latitude, longitude')
          .in('id', memberIds);
        if (active) setCarUsers((data ?? []) as CarUserRow[]);
      } catch (e) {
        // Non-fatal: map still shows school; homes just won't pin. Log it, since
        // a persistent failure also leaves driverStart null, which disables the
        // home auto-end geofence (the manual "End ride" button is the fallback).
        Sentry.captureException(e);
      }
    })();
    return () => {
      active = false;
    };
  }, [memberIds]);

  const stops: MapStop[] = useMemo(() => {
    const list: MapStop[] = [
      { id: 'school', name: SCHOOL.name, point: SCHOOL.point, kind: 'school' },
    ];
    for (const u of carUsers) {
      if (u.latitude === null || u.longitude === null) continue;
      list.push({
        id: u.id,
        name: `${u.full_name} · ${u.child_name}`,
        point: { lat: u.latitude, lng: u.longitude },
        kind: u.id === driverId ? 'driver' : 'rider',
      });
    }
    return list;
  }, [carUsers, driverId]);

  const driverStart = useMemo(() => {
    const d = carUsers.find((u) => u.id === driverId);
    if (d && d.latitude !== null && d.longitude !== null) {
      return { lat: d.latitude, lng: d.longitude };
    }
    return null;
  }, [carUsers, driverId]);

  // Rider home coordinates — the drop-off destinations the map keeps in frame.
  const riderIdSet = useMemo(
    () => new Set((a?.riders ?? []).map((r) => r.userId)),
    [a],
  );
  const riderHomes = useMemo<GeoPoint[]>(
    () =>
      carUsers
        .filter(
          (u) =>
            riderIdSet.has(u.id) && u.latitude !== null && u.longitude !== null,
        )
        .map((u) => ({ lat: u.latitude as number, lng: u.longitude as number })),
    [carUsers, riderIdSet],
  );

  // Geofencing runs even when the app is backgrounded or killed: the trip goes
  // live when the driver reaches BISV to collect riders, and auto-ends once
  // they're home after the drop-offs. It is the convenient path, not the only
  // one — the driver can always start manually (see startRide), which is what
  // makes the feature usable away from campus and testable on a simulator.
  const tripActive = trip?.status === 'on_my_way';
  const tripEnded = trip?.status === 'completed' || trip?.status === 'cancelled';
  const riderIds = useMemo(
    () => (a?.riders ?? []).map((r) => r.userId),
    [a],
  );
  useTripGeofencing({
    enabled: isDriver && !tripEnded,
    driverId: isDriver ? currentUserId : null,
    iso,
    riderIds,
    pickup: SCHOOL.point,
    home: driverStart,
    tripActive,
  });

  // The home auto-end geofence only registers when we know the driver's home
  // coords. When they're missing (no saved address, or a failed users fetch),
  // the trip can never auto-complete, so the manual control is the only way out.
  const autoEndAvailable = driverStart !== null;

  // Manual start. The geofence upserts on the same (driver_id, ride_date) key,
  // so starting by hand and then driving into the pickup region is idempotent
  // rather than a duplicate trip. useTrip surfaces failures via `error`, which
  // is already rendered above the controls.
  async function startRide(): Promise<void> {
    if (starting) return;
    setStarting(true);
    const started = await startTrip(riderIds);
    if (started) {
      track('trip_started', { role: 'driver' });
      // Arm the demo drive here rather than off the trip's status, so opening a
      // ride that is already under way doesn't replay the animation by itself.
      // Inert in a normal build, where DEMO_MODE gates the whole thing.
      setDemoRun(true);
    }
    setStarting(false);
  }

  async function endRide(): Promise<void> {
    if (ending) return;
    setEnding(true);
    await setStatus('completed');
    setEnding(false);
    setConfirmingEnd(false);
  }

  const riders = a?.riders ?? [];
  const status = trip?.status ?? null;
  const pickedUpCount = riders.filter((r) => pickups.has(r.userId)).length;

  // Check a rider off as the car pulls away from their pin. useTrip already
  // applies the change optimistically and rolls back on failure, so the tap
  // lands at once even on a slow curbside connection; the haptic is the same
  // confirmation the rest of the app gives a committed tap.
  //
  // Guarded per rider, not globally: a driver at the curb double-taps, and both
  // presses read the same `pickups.has(riderId)` before React re-renders. Both
  // then insert the same (trip_id, rider_id) row, the second violates the unique
  // constraint, and its rollback un-checks a rider who really is in the car.
  // Keyed by rider so checking two riders in quick succession still works.
  const pickupInFlight = useRef<Set<string>>(new Set());

  function handleTogglePickup(riderId: string): void {
    if (pickupInFlight.current.has(riderId)) return;
    pickupInFlight.current.add(riderId);
    impact();
    void togglePickup(riderId).finally(() => {
      pickupInFlight.current.delete(riderId);
    });
  }

  // Activation funnel: fire trip_completed once per completed trip (per viewer).
  const trackedCompleteRef = useRef(false);
  useEffect(() => {
    if (status === 'completed' && !trackedCompleteRef.current) {
      trackedCompleteRef.current = true;
      track('trip_completed', { role: isDriver ? 'driver' : 'rider' });
    }
  }, [status, isDriver]);
  // The demo drive finishes client-side without writing a status, so the map
  // reports its own arrival and the banner follows it. Always false in a normal
  // build, where `status` alone decides.
  const [demoArrived, setDemoArrived] = useState(false);
  const [demoRun, setDemoRun] = useState(false);
  const arrived = status === 'completed' || demoArrived;
  const statusLabel = arrived
    ? 'Arrived — everyone dropped off'
    : status === 'on_my_way'
      ? 'En route to destination'
      : 'En route to pickup';

  // Emergency: the most reliable safety action is a direct call to 911. We
  // confirm first (so a stray tap doesn't dial) then hand off to the dialer.
  function handleEmergency(): void {
    Alert.alert(
      'Emergency',
      'Call 911 now? Use this only in a real emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call 911',
          style: 'destructive',
          onPress: () =>
            Linking.openURL('tel:911').catch((e) => {
              Sentry.captureException(e);
              Alert.alert('Could not start the call', 'Please dial 911 directly.');
            }),
        },
      ],
    );
  }

  // Share a plain-text status update to a parent who isn't in the car (e.g. the
  // other parent at home). A live read-only web link is a planned follow-up.
  async function handleShareStatus(): Promise<void> {
    const driverName = isDriver ? 'I' : (a?.driver?.name ?? 'The driver');
    const verb = isDriver ? 'am' : 'is';
    const phase =
      status === 'completed'
        ? `${driverName} ${verb} done — everyone's dropped off.`
        : status === 'on_my_way'
          ? `${driverName} ${verb} en route on the Ridr carpool right now.`
          : `${driverName} ${verb} getting ready for the Ridr carpool (pickup ${a ? formatTime(a.time) : 'soon'}).`;
    try {
      await Share.share({ message: `Ridr trip update: ${phase}` });
    } catch (e) {
      Sentry.captureException(e);
    }
  }

  function renderSafety() {
    // Safety controls are available the whole time there's an active carpool,
    // up until the ride is complete.
    if (!a || a.role === 'unmatched' || status === 'completed') return null;
    return (
      <View style={styles.safetyRow}>
        <TouchableOpacity
          style={[styles.safetyBtn, styles.sosBtn]}
          onPress={handleEmergency}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Emergency — call 911"
        >
          <Ionicons name="alert-circle" size={20} color={colors.surfaceWhite} />
          <Text style={styles.sosText}>Emergency</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.safetyBtn, styles.shareBtn]}
          onPress={() => void handleShareStatus()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Share trip status"
        >
          <Ionicons name="share-outline" size={20} color={colors.brandTeal} />
          <Text style={styles.shareText}>Share status</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderControls() {
    if (!a || a.role === 'unmatched') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No live trip</Text>
          <Text style={styles.cardText}>
            There&apos;s no carpool for you on this day, so there&apos;s nothing
            to track.
          </Text>
        </View>
      );
    }

    if (isDriver) {
      if (status === 'completed') {
        return (
          <View style={[styles.card, styles.cardDone]}>
            <Text style={styles.cardTitle}>Ride complete</Text>
            <Text style={styles.cardText}>
              Your riders have been notified that everyone&apos;s dropped off.
            </Text>
          </View>
        );
      }
      if (status === 'on_my_way') {
        return (
          <View style={[styles.card, arrived && styles.cardDone]}>
            <Text style={styles.cardTitle}>
              {arrived ? 'Everyone’s dropped off' : 'Sharing your live location'}
            </Text>
            <Text style={styles.cardText}>
              {arrived
                ? 'You’ve reached the last stop. End the ride to let your riders know you’re done.'
                : autoEndAvailable
                  ? 'Your riders can see your car move in real time. The ride ends automatically once you’ve dropped everyone off and arrive home — or end it now below.'
                  : 'Your riders can see your car move in real time. Tap “End ride” once you’ve dropped everyone off.'}
            </Text>
            {riders.length > 0 ? (
              <>
                {/* The count doubles as the progress read-out, so the driver can
                    see how many stops are left without counting check marks. */}
                <Text style={styles.sectionLabel}>
                  Riders · {pickedUpCount} of {riders.length} picked up
                </Text>
                {riders.map((r) => {
                  const isPickedUp = pickups.has(r.userId);
                  return (
                    <TouchableOpacity
                      key={r.userId}
                      style={[
                        styles.memberRow,
                        styles.pickupRow,
                        isPickedUp && styles.pickupRowDone,
                      ]}
                      onPress={() => handleTogglePickup(r.userId)}
                      activeOpacity={0.7}
                      // Announced as a checkbox, not as text: this is the one
                      // control on the screen a driver uses while the car is
                      // moving, so it has to be findable by role.
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isPickedUp }}
                      // Identity only. `accessibilityRole="checkbox"` plus
                      // `accessibilityState` already make VoiceOver append
                      // "checked"/"not checked", so putting the status in the
                      // label too announced an unchecked row as
                      // "Marcus, picked up, not checked" — it contradicts itself.
                      accessibilityLabel={r.name}
                      accessibilityHint={
                        isPickedUp
                          ? 'Marks this rider as not picked up'
                          : 'Marks this rider as picked up'
                      }
                    >
                      <View style={[styles.avatar, isPickedUp && styles.avatarDone]}>
                        <Text style={styles.avatarText}>{initials(r.name)}</Text>
                      </View>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={styles.memberTime}>{formatTime(r.time)}</Text>
                      {/* Outline circle → filled check: the shape changes as well
                          as the colour, so the state survives colour blindness
                          and a sun-washed windscreen. */}
                      <Ionicons
                        name={isPickedUp ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24}
                        color={isPickedUp ? '#15803D' : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}
            {confirmingEnd ? (
              <View style={styles.endConfirm}>
                <Text style={styles.endConfirmText}>
                  End the ride for everyone? This notifies your riders and stops
                  live location sharing.
                </Text>
                <View style={styles.endConfirmRow}>
                  <View style={styles.endConfirmBtn}>
                    <Button
                      title="Keep sharing"
                      variant="outline"
                      disabled={ending}
                      onPress={() => setConfirmingEnd(false)}
                    />
                  </View>
                  <View style={styles.endConfirmBtn}>
                    <Button
                      title="End ride"
                      variant="primary"
                      loading={ending}
                      onPress={() => void endRide()}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.endBtnWrap}>
                <Button
                  title="End ride"
                  variant={autoEndAvailable ? 'outline' : 'primary'}
                  onPress={() => setConfirmingEnd(true)}
                />
              </View>
            )}
          </View>
        );
      }
      // No trip yet → en route to the first pickup. The geofence arms tracking
      // on arrival at BISV, but the driver can start now — leaving early, or
      // anywhere the geofence can't reach them.
      return (
        <View style={[styles.card, styles.cardPrimary]}>
          <Text style={[styles.cardTitle, styles.cardTitlePrimary]}>
            Ready to drive
          </Text>
          {/* Deliberately promises the next state in the words that state uses
              ("see your car move in real time"), so starting the ride reads as
              this card keeping its word rather than a new screen appearing. */}
          <Text style={styles.cardText}>
            Start when you set off. Your riders will see your car move in real
            time.
          </Text>
          <View style={styles.startBtnWrap}>
            <Button
              title="Start ride"
              variant="primary"
              loading={starting}
              onPress={() => void startRide()}
            />
          </View>
          <Text style={styles.startHint}>
            It also starts on its own at {SCHOOL.name}.
          </Text>
        </View>
      );
    }

    // Rider view.
    const driverName = a.driver?.name ?? 'your driver';
    if (status === 'completed') {
      return (
        <View style={[styles.card, styles.cardDone]}>
          <Text style={styles.cardTitle}>Dropped off</Text>
          <Text style={styles.cardText}>
            {driverName} has finished the carpool. See you next time!
          </Text>
        </View>
      );
    }
    if (status === 'on_my_way') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tracking {driverName}</Text>
          <Text style={styles.cardText}>
            Watch {driverName}&apos;s car move in real time on the map above.
            Pickup at {formatTime(a.time)}.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Waiting for {driverName}</Text>
        <Text style={styles.cardText}>
          {driverName} hasn&apos;t started the ride yet. The car will appear here
          live once they&apos;re on the way. Pickup at {formatTime(a.time)}.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Live trip</Text>
          <Text style={styles.subtitle}>{formatDayLabel(date)}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color={colors.brandTeal} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {error ? <ErrorMessage message={error} /> : null}

          {a && a.role !== 'unmatched' ? (
            <View style={[styles.mapCard, { height: MAP_HEIGHT }]}>
              <LiveMap
                channel={channelName}
                stops={stops}
                start={driverStart}
                destinations={riderHomes}
                carColorKey={a.driver?.car.color ?? null}
                // Ending the ride stops the drive; the map freezes on the
                // completed picture rather than replaying it.
                demoRun={demoRun && !tripEnded}
                onDemoArrived={() => {
                  setDemoArrived(true);
                  // The demo's "trip complete" beat. The synthetic drive never
                  // writes a status, so this arrival is the only signal the
                  // script can hang the banner off. Inert in a normal build:
                  // LiveMap only ever calls this behind DEMO_MODE.
                  notifyDemoTripComplete(iso);
                }}
              />
            </View>
          ) : null}

          <View style={[styles.statusBanner, arrived && styles.statusBannerDone]}>
            <View
              style={[
                styles.statusDot,
                arrived
                  ? styles.dotGreen
                  : status === 'on_my_way'
                    ? styles.dotActive
                    : styles.dotGrey,
              ]}
            />
            <Text style={[styles.statusText, arrived && styles.statusTextDone]}>
              {statusLabel}
            </Text>
          </View>

          {/* Riders waiting at the curb get the driver's car + plate, big and
              scannable. Drivers know their own car, so it's hidden for them, and
              there's nothing to spot once the ride is complete. */}
          {!isDriver && a?.driver && status !== 'completed' ? (
            <DriverVehicleCard driverName={a.driver.name} car={a.driver.car} />
          ) : null}

          {shareError ? <ErrorMessage message={shareError} /> : null}

          {renderControls()}

          {renderSafety()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWhite },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  safetyRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  safetyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sosBtn: { backgroundColor: colors.error },
  sosText: { fontSize: 15, fontWeight: '700', color: colors.surfaceWhite },
  shareBtn: {
    borderWidth: 1.5,
    borderColor: colors.brandTeal,
    backgroundColor: colors.brandTealLight,
  },
  shareText: { fontSize: 15, fontWeight: '700', color: colors.brandTeal },
  headerSpacer: { width: 41 },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  mapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    marginBottom: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: colors.brandTeal },
  dotGreen: { backgroundColor: colors.success },
  dotGrey: { backgroundColor: '#C9CDD4' },
  // Arrival tints the whole banner rather than just the dot — at a glance the
  // green field is what reads as "done", not a 10pt circle.
  statusBannerDone: { backgroundColor: colors.successLight },
  statusText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  statusTextDone: { color: '#15803D' },
  card: {
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  // The card frame carries the trip's state in the same three colours as the
  // status dot above it: teal while the card is asking the driver for
  // something, green once the ride is done, neutral while it only reports. The
  // border is the whole signal — no second badge competing with the banner.
  cardPrimary: { borderColor: colors.brandTeal, padding: 20 },
  cardDone: { borderColor: colors.success },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 6,
  },
  // One clear step up from the reporting cards; matches the screen title's size
  // so the acting card sits at the top of the page's type scale, not beside it.
  cardTitlePrimary: { fontSize: 18, marginBottom: 8 },
  cardText: { fontSize: 14, color: colors.inkSecondary, lineHeight: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.surfaceWhite, fontSize: 12, fontWeight: '700' },
  // Crimson would sit directly against the row's green tint once the rider is
  // aboard; the darker green keeps white initials at 5:1 and stops the two
  // near-complementary brand hues fighting inside a 34pt circle.
  avatarDone: { backgroundColor: '#15803D' },
  // Padding is always present and the inset margin cancels it, so checking a
  // rider off paints a tint behind an unmoved row rather than nudging the list.
  pickupRow: {
    minHeight: 44,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderRadius: 10,
  },
  pickupRowDone: { backgroundColor: colors.successLight },
  memberName: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.ink },
  memberTime: { fontSize: 13, fontWeight: '600', color: colors.inkSecondary },
  startBtnWrap: { marginTop: 18 },
  // Reassurance, not instruction: sits under the button as fine print so the
  // geofence is discoverable without competing with the tap it makes optional.
  startHint: {
    fontSize: 13,
    color: colors.inkSecondary,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },
  endBtnWrap: { marginTop: 18 },
  endConfirm: { marginTop: 18 },
  endConfirmText: {
    fontSize: 14,
    color: colors.inkSecondary,
    lineHeight: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  endConfirmRow: { flexDirection: 'row', gap: 12 },
  endConfirmBtn: { flex: 1 },
});
