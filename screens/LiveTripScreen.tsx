import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MapStop, ScheduleStackParamList } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { LiveMap } from '@/components/map/LiveMap';
import { useCarpool } from '@/hooks/useCarpool';
import { useTrip } from '@/hooks/useTrip';
import { useLocationSharing } from '@/hooks/useLocationSharing';
import { useAutoEndTrip } from '@/hooks/useAutoEndTrip';
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

  const { trip, loading, error, startTrip, setStatus } = useTrip(driverId, iso);

  // The driver shares GPS only while the ride is active (started, not ended).
  const sharingActive = isDriver && trip?.status === 'on_my_way';
  const channelName = driverId ? tripLocChannel(driverId, iso) : 'noop';
  const { error: shareError } = useLocationSharing(sharingActive, channelName);

  // Fetch the car's members so we can pin homes on the map + list riders.
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

  const handleAutoEnd = useCallback(() => {
    void setStatus('completed');
  }, [setStatus]);
  useAutoEndTrip(sharingActive, driverStart, handleAutoEnd);

  const riders = a?.riders ?? [];
  const status = trip?.status ?? null;
  const statusLabel =
    status === 'completed'
      ? 'Ride complete'
      : status === 'on_my_way'
        ? 'On the way 🚗'
        : 'Ride not started';

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
              Your riders can see your car move in real time. The ride ends
              automatically when you arrive home or at school.
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
            <TouchableOpacity
              style={styles.endEarlyBtn}
              onPress={() => void setStatus('completed')}
              activeOpacity={0.6}
            >
              <Text style={styles.endEarlyText}>End early</Text>
            </TouchableOpacity>
          </View>
        );
      }
      // No trip yet.
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ready to drive?</Text>
          <Text style={styles.cardText}>
            Tap Start ride and the app shares your live location with your riders
            until you end the ride — no need to keep your phone out.
          </Text>
          <View style={styles.startBtn}>
            <Button
              title="Start ride"
              onPress={() => void startTrip(riders.map((r) => r.userId))}
            />
          </View>
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
  startBtn: { marginTop: 16 },
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
  endEarlyBtn: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  endEarlyText: { fontSize: 13, color: '#8391A1', textDecorationLine: 'underline' },
});
