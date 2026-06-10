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
import type { CarpoolMember, ScheduleStackParamList } from '@/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useCarpoolWeek } from '@/hooks/useCarpoolWeek';
import { formatDayLabel, formatTime, weekdayKeyFromDate } from '@/lib/dateUtils';

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

function MemberRow({ member, dark }: { member: CarpoolMember; dark?: boolean }) {
  return (
    <View style={styles.memberRow}>
      <View style={[styles.avatar, dark ? styles.avatarDark : null]}>
        <Text style={styles.avatarText}>{initials(member.name)}</Text>
      </View>
      <Text style={styles.memberName} numberOfLines={1}>
        {member.name}
      </Text>
      {member.time ? (
        <Text style={styles.memberTime}>{formatTime(member.time)}</Text>
      ) : null}
    </View>
  );
}

export function ScheduleScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<Date>(() => new Date());
  const { byDay, loading, error, currentUserId } = useCarpoolWeek();

  const dayKey = weekdayKeyFromDate(selected);
  const dayCarpool = dayKey ? byDay[dayKey] : null;

  // Work out the signed-in parent's perspective for the selected day.
  const myDriverGroup =
    dayCarpool && currentUserId
      ? dayCarpool.groups.find((g) => g.driver.userId === currentUserId)
      : undefined;
  const myRiderGroup =
    dayCarpool && currentUserId
      ? dayCarpool.groups.find((g) =>
          g.riders.some((r) => r.userId === currentUserId),
        )
      : undefined;
  const amUnmatched = Boolean(
    dayCarpool &&
      currentUserId &&
      dayCarpool.unmatchedRiders.some((r) => r.userId === currentUserId),
  );

  function renderGroup() {
    if (!dayKey) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>No school carpool on weekends.</Text>
        </View>
      );
    }
    if (myDriverGroup) {
      return (
        <View style={styles.groupCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusDriving}>You&apos;re driving</Text>
            {myDriverGroup.zone ? (
              <View style={styles.zoneBadge}>
                <Text style={styles.zoneBadgeText}>{myDriverGroup.zone}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subtle}>
            Pickup around {formatTime(myDriverGroup.driver.time)}
          </Text>
          <Text style={styles.sectionLabel}>
            Your riders ({myDriverGroup.riders.length})
          </Text>
          {myDriverGroup.riders.length === 0 ? (
            <Text style={styles.infoText}>
              No riders matched to you yet. We&apos;ll pair nearby families with a
              similar pickup time.
            </Text>
          ) : (
            myDriverGroup.riders.map((r) => (
              <MemberRow key={r.userId} member={r} />
            ))
          )}
        </View>
      );
    }
    if (myRiderGroup) {
      const coRiders = myRiderGroup.riders.filter(
        (r) => r.userId !== currentUserId,
      );
      return (
        <View style={styles.groupCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusRiding}>You&apos;re riding</Text>
            {myRiderGroup.zone ? (
              <View style={styles.zoneBadge}>
                <Text style={styles.zoneBadgeText}>{myRiderGroup.zone}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.sectionLabel}>Driver</Text>
          <MemberRow member={myRiderGroup.driver} dark />
          <Text style={styles.sectionLabel}>
            Other riders ({coRiders.length})
          </Text>
          {coRiders.length === 0 ? (
            <Text style={styles.infoText}>Just you so far.</Text>
          ) : (
            coRiders.map((r) => <MemberRow key={r.userId} member={r} />)
          )}
        </View>
      );
    }
    if (amUnmatched) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>No match yet</Text>
          <Text style={styles.infoText}>
            We couldn&apos;t find a driver in your area within 30 minutes of your
            pickup time. You&apos;ll be paired automatically as more families set
            their schedules.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Not carpooling this day</Text>
        <Text style={styles.infoText}>
          Set whether you&apos;re driving or riding and your pickup time to get
          matched automatically.
        </Text>
        <View style={styles.infoButton}>
          <Button
            title="Edit my schedule"
            onPress={() => navigation.navigate('EditSchedule')}
          />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.wordmark}>BasisRide</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditSchedule')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.editLink}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorMessage message={error} /> : null}

        <CalendarPicker selected={selected} onSelect={setSelected} />

        <Text style={styles.dayHeading}>{formatDayLabel(selected)}</Text>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#DC143C" size="large" />
          </View>
        ) : (
          renderGroup()
        )}
      </ScrollView>
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
  editLink: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC143C',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  dayHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E232C',
    marginTop: 24,
    marginBottom: 12,
  },
  loadingArea: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  groupCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusDriving: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16A34A',
  },
  statusRiding: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16A34A',
  },
  zoneBadge: {
    backgroundColor: '#F7F8F9',
    borderWidth: 1,
    borderColor: '#DADADA',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoneBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6A707C',
  },
  subtle: {
    fontSize: 13,
    color: '#6A707C',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8391A1',
    marginTop: 12,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDark: {
    backgroundColor: '#1E232C',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1E232C',
  },
  memberTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6A707C',
  },
  infoCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#6A707C',
    lineHeight: 20,
  },
  infoButton: {
    marginTop: 16,
  },
});
