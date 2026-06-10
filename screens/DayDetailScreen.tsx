import React, { useState } from 'react';
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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ScheduleStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { BackButton } from '@/components/ui/BackButton';
import { webScreenFix } from '@/components/ui/FormScroll';
import { supabase, mapSupabaseError } from '@/lib/supabase';
import { useWeekRides } from '@/hooks/useWeekRides';
import {
  formatDayLabel,
  getWeekEnd,
  getWeekStart,
  parseISO,
  toISO,
} from '@/lib/dateUtils';

type DayDetailNavigationProp = StackNavigationProp<
  ScheduleStackParamList,
  'DayDetail'
>;
type DayDetailRoute = RouteProp<ScheduleStackParamList, 'DayDetail'>;

interface Props {
  navigation: DayDetailNavigationProp;
  route: DayDetailRoute;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DayDetailScreen({ navigation, route }: Props) {
  const { date } = route.params;
  const parsed = parseISO(date);
  const weekStart = getWeekStart(parsed);

  const tabBarHeight = useBottomTabBarHeight();

  const {
    ridesByDate,
    loading,
    error,
    currentUserId,
    offerToDrive,
    claimSeat,
    cancelSeat,
  } = useWeekRides(toISO(weekStart), toISO(getWeekEnd(weekStart)));

  const [swapOpen, setSwapOpen] = useState(false);
  const [note, setNote] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapDone, setSwapDone] = useState(false);

  const day = ridesByDate[date];
  const driver = day?.driver ?? null;
  const riders = day?.riders ?? [];
  const capacity = driver?.driverCapacity ?? 0;
  const occupied = driver ? 1 + riders.length : 0;
  const seatsAvailable = day?.seatsAvailable ?? 0;
  const isDriver = Boolean(
    driver && currentUserId && driver.driver_id === currentUserId,
  );
  const isRider = Boolean(
    currentUserId && riders.some((r) => r.rider_id === currentUserId),
  );
  const full = driver ? occupied >= capacity : false;

  async function handleRequestSwap(): Promise<void> {
    if (!currentUserId) {
      setSwapError('You must be signed in.');
      return;
    }
    setSwapError(null);
    setSwapLoading(true);
    try {
      const { error: insertError } = await supabase.from('swaps').insert({
        requester_id: currentUserId,
        day: date,
        note: note.trim() ? note.trim() : null,
      });
      if (insertError) {
        setSwapError(mapSupabaseError(insertError));
        return;
      }
      setSwapDone(true);
      setSwapOpen(false);
      setNote('');
    } catch {
      setSwapError('Could not request a swap. Please try again.');
    } finally {
      setSwapLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {formatDayLabel(parsed)}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color="#DC143C" size="large" />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: tabBarHeight + 120 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {error ? <ErrorMessage message={error} /> : null}

            {!driver ? (
              <View style={styles.emptyState}>
                <Ionicons name="car-outline" size={48} color="#8391A1" />
                <Text style={styles.emptyTitle}>No driver yet</Text>
                <Text style={styles.emptySub}>
                  Be the first to offer a ride for this day.
                </Text>
                <View style={styles.emptyButton}>
                  <Button
                    title="Offer to drive"
                    onPress={() => offerToDrive(date)}
                  />
                </View>
              </View>
            ) : (
              <View>
                {/* Driver card */}
                <View style={styles.driverCard}>
                  <View style={styles.driverRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {initials(driver.driverName)}
                      </Text>
                    </View>
                    <View style={styles.driverInfo}>
                      <Text style={styles.driverName}>{driver.driverName}</Text>
                      <Text style={styles.driverNeighborhood}>
                        {driver.driverNeighborhood}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Driving</Text>
                    </View>
                  </View>
                  <Text style={styles.seatsAvailable}>
                    {seatsAvailable} {seatsAvailable === 1 ? 'seat' : 'seats'}{' '}
                    available
                  </Text>
                </View>

                {/* Driver-only swap section */}
                {isDriver ? (
                  <View style={styles.section}>
                    <Text style={styles.youDriver}>You&apos;re the driver</Text>
                    {swapDone ? (
                      <Text style={styles.swapDone}>Swap requested.</Text>
                    ) : swapOpen ? (
                      <View style={styles.swapForm}>
                        <ErrorMessage message={swapError} />
                        <Input
                          label="Add a note (optional)"
                          value={note}
                          onChangeText={setNote}
                          placeholder="e.g. Need someone to cover Friday"
                        />
                        <Button
                          title="Submit swap request"
                          onPress={handleRequestSwap}
                          loading={swapLoading}
                        />
                        <TouchableOpacity
                          style={styles.cancelSwap}
                          onPress={() => {
                            setSwapOpen(false);
                            setSwapError(null);
                          }}
                        >
                          <Text style={styles.cancelSwapText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => setSwapOpen(true)}>
                        <Text style={styles.swapLink}>Request a swap →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}

                {/* Riders */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Riders</Text>
                  {riders.length === 0 ? (
                    <Text style={styles.noRiders}>No riders have joined yet.</Text>
                  ) : (
                    riders.map((r) => (
                      <View key={r.id} style={styles.riderRow}>
                        <View style={styles.riderAvatar}>
                          <Text style={styles.riderAvatarText}>
                            {initials(r.riderName)}
                          </Text>
                        </View>
                        <Text style={styles.riderName} numberOfLines={1}>
                          {r.riderName}
                        </Text>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>Confirmed</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Sticky bottom action bar, above the tab bar */}
          {driver && !isDriver ? (
            <View style={[styles.actionBar, { bottom: tabBarHeight }]}>
              {isRider ? (
                <View style={styles.ridingRow}>
                  <Text style={styles.youRiding}>You&apos;re riding</Text>
                  <TouchableOpacity onPress={() => cancelSeat(date)}>
                    <Text style={styles.cancelSeat}>Cancel my seat</Text>
                  </TouchableOpacity>
                </View>
              ) : full ? (
                <Button title="Full" disabled onPress={() => undefined} />
              ) : (
                <Button title="Claim a seat" onPress={() => claimSeat(date)} />
              )}
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF4',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1E232C',
  },
  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E232C',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    color: '#8391A1',
    marginTop: 6,
    textAlign: 'center',
  },
  emptyButton: {
    width: '100%',
    marginTop: 24,
  },
  driverCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
  },
  driverNeighborhood: {
    fontSize: 13,
    color: '#6A707C',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
    letterSpacing: 0.2,
  },
  seatsAvailable: {
    fontSize: 13,
    color: '#6A707C',
    marginTop: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 12,
  },
  youDriver: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
    marginBottom: 8,
  },
  swapLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC143C',
  },
  swapForm: {
    marginTop: 4,
  },
  cancelSwap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelSwapText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6A707C',
  },
  swapDone: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16A34A',
  },
  noRiders: {
    fontSize: 14,
    color: '#8391A1',
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  riderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E232C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  riderName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1E232C',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF4',
  },
  ridingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  youRiding: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
  },
  cancelSeat: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC143C',
  },
});
