import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type {
  MapStop,
  ScheduleStackParamList,
  TripStatus,
} from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { LiveMap } from '@/components/map/LiveMap';
import { useCarpool } from '@/hooks/useCarpool';
import { useTrip } from '@/hooks/useTrip';
import { useLocationSharing } from '@/hooks/useLocationSharing';
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

const STATUS_LABEL: Record<TripStatus, string> = {
  on_my_way: 'On the way 🚗',
  arrived: 'Arrived at school',
  completed: 'Carpool complete',
  cancelled: 'Trip cancelled',
};

export function LiveTripScreen({ navigation, route }: Props) {
  const iso = route.params.date;
  const date = parseISO(iso);
  const { currentUserId, assignmentFor } = useCarpool();
  const a = assignmentFor(date);

  const isDriver = a?.role === 'drive';
  const driverId = isDriver ? currentUserId : (a?.driver?.userId ?? null);

  const { trip, pickups, loading, error, startTrip, setStatus, togglePickup } =
    useTrip(driverId, iso);

  // Driver shares GPS while the trip is active (after start, before complete).
  const sharingActive =
    isDriver &&
    !!trip &&
    (trip.status === 'on_my_way' || trip.status === 'arrived');
  const channelName = driverId ? tripLocChannel(driverId, iso) : 'noop';
  const { error: shareError } = useLocationSharing(sharingActive, channelName);

  // Fetch the car's members so we can pin homes on the map and list pickups.
  const [carUsers, setCarUsers] = useState<CarUserRow[]>([]);
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
      } catch {
        // Non-fatal: map still shows school; homes just won't pin.
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

  const riders = a?.riders ?? [];

  function renderBody() {
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

    return (
      <>
        <View style={styles.mapCard}>
          <LiveMap channel={channelName} stops={stops} start={driverStart} />
        </View>

        {/* Status banner */}
        <View style={styles.statusBanner}>
          <View
            style={[
              styles.statusDot,
              trip?.status === 'arrived'
                ? styles.dotGreen
                : trip?.status === 'on_my_way'
                  ? styles.dotCrimson
                  : styles.dotGrey,
            ]}
          />
          <Text style={styles.statusText}>
            {trip ? STATUS_LABEL[trip.status] : 'Trip not started yet'}
          </Text>
        </View>

        {shareError ? <ErrorMessage message={shareError} /> : null}

        {isDriver ? (
          <DriverControls
            hasTrip={!!trip}
            status={trip?.status ?? null}
            riders={riders}
            pickups={pickups}
            onStart={() => void startTrip(riders.map((r) => r.userId))}
            onStatus={(s) => void setStatus(s)}
            onTogglePickup={(id) => void togglePickup(id)}
          />
        ) : (
          <RiderView
            hasTrip={!!trip}
            pickedUp={currentUserId ? pickups.has(currentUserId) : false}
            driverName={a.driver?.name ?? 'your driver'}
            pickupTime={a.time}
          />
        )}
      </>
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
          {renderBody()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DriverControls({
  hasTrip,
  status,
  riders,
  pickups,
  onStart,
  onStatus,
  onTogglePickup,
}: {
  hasTrip: boolean;
  status: TripStatus | null;
  riders: { userId: string; name: string; time: string }[];
  pickups: Set<string>;
  onStart: () => void;
  onStatus: (s: TripStatus) => void;
  onTogglePickup: (id: string) => void;
}) {
  if (!hasTrip) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ready to drive?</Text>
        <Text style={styles.cardText}>
          Start the trip to share your live location with your riders and check
          kids off as you pick them up.
        </Text>
        <View style={styles.startBtn}>
          <Button title="Start trip & share location" onPress={onStart} />
        </View>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.sectionLabel}>Trip status</Text>
      <View style={styles.statusRow}>
        {(
          [
            ['on_my_way', 'On my way'],
            ['arrived', 'Arrived'],
            ['completed', 'Complete'],
          ] as [TripStatus, string][]
        ).map(([value, label]) => {
          const selected = status === value;
          return (
            <TouchableOpacity
              key={value}
              style={[styles.statusPill, selected && styles.statusPillActive]}
              onPress={() => onStatus(value)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.statusPillText,
                  selected && styles.statusPillTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Pickups ({pickups.size}/{riders.length})</Text>
      <View style={styles.card}>
        {riders.length === 0 ? (
          <Text style={styles.cardText}>No riders in your car today.</Text>
        ) : (
          riders.map((r) => {
            const done = pickups.has(r.userId);
            return (
              <TouchableOpacity
                key={r.userId}
                style={styles.pickupRow}
                onPress={() => onTogglePickup(r.userId)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, done && styles.checkboxOn]}>
                  {done ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : null}
                </View>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(r.name)}</Text>
                </View>
                <Text
                  style={[styles.pickupName, done && styles.pickupNameDone]}
                  numberOfLines={1}
                >
                  {r.name}
                </Text>
                <Text style={styles.pickupTime}>{formatTime(r.time)}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </>
  );
}

function RiderView({
  hasTrip,
  pickedUp,
  driverName,
  pickupTime,
}: {
  hasTrip: boolean;
  pickedUp: boolean;
  driverName: string;
  pickupTime: string;
}) {
  if (!hasTrip) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Waiting for {driverName}</Text>
        <Text style={styles.cardText}>
          Your driver hasn&apos;t started the trip yet. You&apos;ll see the car
          move here live once they&apos;re on the way. Pickup at{' '}
          {formatTime(pickupTime)}.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {pickedUp ? 'Picked up ✅' : `Tracking ${driverName}`}
      </Text>
      <Text style={styles.cardText}>
        {pickedUp
          ? 'Your child is in the car. Follow the map to school.'
          : `Watch ${driverName}'s car move toward you in real time. Pickup at ${formatTime(pickupTime)}.`}
      </Text>
    </View>
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
    height: 320,
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
  startBtn: { marginTop: 16 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8391A1',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statusPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    alignItems: 'center',
  },
  statusPillActive: { backgroundColor: '#DC143C', borderColor: '#DC143C' },
  statusPillText: { fontSize: 14, fontWeight: '700', color: '#6A707C' },
  statusPillTextActive: { color: '#FFFFFF' },
  pickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C9CDD4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  pickupName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1E232C' },
  pickupNameDone: { color: '#8391A1', textDecorationLine: 'line-through' },
  pickupTime: { fontSize: 13, fontWeight: '600', color: '#6A707C' },
});
