import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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
import { formatDayLabel, formatTime, parseISO } from '@/lib/dateUtils';

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

function initials(name: string): string {
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
  const { currentUserId, assignmentFor } = useCarpool();
  const a = assignmentFor(date);

  const isDriver = a?.role === 'drive';
  const driverId = isDriver ? currentUserId : (a?.driver?.userId ?? null);

  const { trip, loading, error, setStatus } = useTrip(driverId, iso);

  // The driver shares GPS only while the ride is active (started, not ended).
  const sharingActive = isDriver && trip?.status === 'on_my_way';
  const channelName = driverId ? tripLocChannel(driverId, iso) : 'noop';
  const { error: shareError } = useLocationSharing(sharingActive, channelName);

  // Fetch the car's members so we can pin homes on the map + list riders.
  const [carUsers, setCarUsers] = useState<CarUserRow[]>([]);
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

  // Geofencing replaces the old "Start ride" button and runs even when the app
  // is backgrounded or killed: the trip goes live when the driver reaches BISV
  // to collect riders, and auto-ends once they're home after the drop-offs.
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

  async function endRide(): Promise<void> {
    if (ending) return;
    setEnding(true);
    await setStatus('completed');
    setEnding(false);
    setConfirmingEnd(false);
  }

  const riders = a?.riders ?? [];
  const status = trip?.status ?? null;
  const statusLabel =
    status === 'completed'
      ? 'Arrived — ride complete'
      : status === 'on_my_way'
        ? 'En route to destination'
        : 'En route to pickup';

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
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ride complete ✅</Text>
            <Text style={styles.cardText}>
              Your riders have been notified that everyone&apos;s dropped off.
            </Text>
          </View>
        );
      }
      if (status === 'on_my_way') {
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sharing your live location</Text>
            <Text style={styles.cardText}>
              {autoEndAvailable
                ? 'Your riders can see your car move in real time. The ride ends automatically once you’ve dropped everyone off and arrive home — or end it now below.'
                : 'Your riders can see your car move in real time. Tap “End ride” once you’ve dropped everyone off.'}
            </Text>
            {riders.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Riders ({riders.length})</Text>
                {riders.map((r) => (
                  <View key={r.userId} style={styles.memberRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(r.name)}</Text>
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.memberTime}>{formatTime(r.time)}</Text>
                  </View>
                ))}
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
      // No trip yet → en route to the first pickup. Tracking arms automatically.
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>En route to pickup</Text>
          <Text style={styles.cardText}>Tracking starts automatically at pickup.</Text>
        </View>
      );
    }

    // Rider view.
    const driverName = a.driver?.name ?? 'your driver';
    if (status === 'completed') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dropped off ✅</Text>
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
          <ActivityIndicator color="#DC143C" size="large" />
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
              />
            </View>
          ) : null}

          <View style={styles.statusBanner}>
            <View
              style={[
                styles.statusDot,
                status === 'completed'
                  ? styles.dotGreen
                  : status === 'on_my_way'
                    ? styles.dotCrimson
                    : styles.dotGrey,
              ]}
            />
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>

          {/* Riders waiting at the curb get the driver's car + plate, big and
              scannable. Drivers know their own car, so it's hidden for them, and
              there's nothing to spot once the ride is complete. */}
          {!isDriver && a?.driver && status !== 'completed' ? (
            <DriverVehicleCard driverName={a.driver.name} car={a.driver.car} />
          ) : null}

          {shareError ? <ErrorMessage message={shareError} /> : null}

          {renderControls()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DADADA',
  },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', color: '#1E232C' },
  subtitle: { fontSize: 13, color: '#8391A1', marginTop: 1 },
  headerSpacer: { width: 41 },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  mapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    marginBottom: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F7F8F9',
    borderRadius: 12,
    marginBottom: 16,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotCrimson: { backgroundColor: '#DC143C' },
  dotGreen: { backgroundColor: '#16A34A' },
  dotGrey: { backgroundColor: '#C9CDD4' },
  statusText: { fontSize: 15, fontWeight: '700', color: '#1E232C' },
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 6,
  },
  cardText: { fontSize: 14, color: '#6A707C', lineHeight: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8391A1',
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
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  memberName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1E232C' },
  memberTime: { fontSize: 13, fontWeight: '600', color: '#6A707C' },
  endBtnWrap: { marginTop: 18 },
  endConfirm: { marginTop: 18 },
  endConfirmText: {
    fontSize: 14,
    color: '#6A707C',
    lineHeight: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  endConfirmRow: { flexDirection: 'row', gap: 12 },
  endConfirmBtn: { flex: 1 },
});
