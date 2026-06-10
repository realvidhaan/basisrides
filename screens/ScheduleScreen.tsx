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
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ScheduleStackParamList } from '@/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useWeekRides } from '@/hooks/useWeekRides';
import {
  formatDayLabel,
  formatWeekLabel,
  getWeekDates,
  getWeekEnd,
  getWeekStart,
  toISO,
} from '@/lib/dateUtils';

type ScheduleNavigationProp = StackNavigationProp<
  ScheduleStackParamList,
  'Schedule'
>;

interface Props {
  navigation: ScheduleNavigationProp;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ScheduleScreen({ navigation }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );

  const weekStartISO = toISO(weekStart);
  const weekEndISO = toISO(getWeekEnd(weekStart));

  const {
    ridesByDate,
    loading,
    error,
    currentUserId,
    offerToDrive,
    claimSeat,
  } = useWeekRides(weekStartISO, weekEndISO);

  function shiftWeek(deltaDays: number): void {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + deltaDays);
    setWeekStart(getWeekStart(d));
  }

  const weekDates = getWeekDates(weekStart);

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.wordmark}>BasisRide</Text>
        <View style={styles.weekNav}>
          <TouchableOpacity
            onPress={() => shiftWeek(-7)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Previous week"
          >
            <Text style={styles.chevron}>‹</Text>
          </TouchableOpacity>
          {loading ? (
            <ActivityIndicator
              color="#DC143C"
              size="small"
              style={styles.weekSpinner}
            />
          ) : (
            <Text style={styles.weekLabel}>{formatWeekLabel(weekStart)}</Text>
          )}
          <TouchableOpacity
            onPress={() => shiftWeek(7)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Next week"
          >
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorWrap}>
          <ErrorMessage message={error} />
        </View>
      ) : null}

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
          {weekDates.map((date) => {
            const iso = toISO(date);
            const day = ridesByDate[iso];
            const driver = day?.driver ?? null;
            const riders = day?.riders ?? [];
            const capacity = driver?.driverCapacity ?? 0;
            const occupied = driver ? 1 + riders.length : 0;
            const isDriver = Boolean(
              driver && currentUserId && driver.driver_id === currentUserId,
            );
            const isRider = Boolean(
              currentUserId && riders.some((r) => r.rider_id === currentUserId),
            );
            const full = driver ? occupied >= capacity : false;
            const fillPct =
              capacity > 0 ? Math.min(100, (occupied / capacity) * 100) : 0;

            return (
              <TouchableOpacity
                key={iso}
                activeOpacity={0.9}
                style={styles.card}
                onPress={() => navigation.navigate('DayDetail', { date: iso })}
              >
                <Text style={styles.dayLabel}>{formatDayLabel(date)}</Text>

                {!driver ? (
                  <View style={styles.noDriverBlock}>
                    <Text style={styles.noDriverText}>No driver yet</Text>
                    <Button
                      title="Offer to drive"
                      onPress={() => offerToDrive(iso)}
                    />
                  </View>
                ) : (
                  <View>
                    <View style={styles.driverRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {initials(driver.driverName)}
                        </Text>
                      </View>
                      <View style={styles.driverInfo}>
                        <Text style={styles.driverName} numberOfLines={1}>
                          {driver.driverName}
                        </Text>
                      </View>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Driving</Text>
                      </View>
                    </View>

                    <View style={styles.progressTrack}>
                      <View
                        style={[styles.progressFill, { width: `${fillPct}%` }]}
                      />
                    </View>
                    <Text style={styles.seatText}>
                      {occupied} of {capacity} seats
                    </Text>

                    <View style={styles.actionRow}>
                      {isDriver ? (
                        <View>
                          <Text style={styles.youDriving}>You&apos;re driving</Text>
                          <TouchableOpacity
                            onPress={() =>
                              navigation.navigate('DayDetail', { date: iso })
                            }
                          >
                            <Text style={styles.swapLink}>
                              Can&apos;t make it? Request a swap →
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : isRider ? (
                        <Text style={styles.youRiding}>You&apos;re riding</Text>
                      ) : full ? (
                        <Button title="Full" disabled onPress={() => undefined} />
                      ) : (
                        <Button
                          title="Claim a seat"
                          variant="outline"
                          onPress={() => claimSeat(iso)}
                        />
                      )}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF4',
  },
  wordmark: {
    fontSize: 26,
    fontWeight: '700',
    color: '#DC143C',
    letterSpacing: -0.5,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 26,
    lineHeight: 28,
    color: '#1E232C',
    paddingHorizontal: 8,
  },
  weekLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E232C',
    minWidth: 96,
    textAlign: 'center',
  },
  weekSpinner: {
    minWidth: 96,
  },
  errorWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
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
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 12,
  },
  noDriverBlock: {
    gap: 12,
  },
  noDriverText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8391A1',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E232C',
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8ECF4',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC143C',
  },
  seatText: {
    fontSize: 12,
    color: '#6A707C',
    marginTop: 6,
    marginBottom: 12,
  },
  actionRow: {
    marginTop: 4,
  },
  youDriving: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
    marginBottom: 6,
  },
  youRiding: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
  },
  swapLink: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A707C',
  },
});
