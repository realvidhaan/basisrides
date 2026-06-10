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
import type { DayWidget, ScheduleStackParamList } from '@/types';
import type { CarMember } from '@/lib/pairing';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useCarpool } from '@/hooks/useCarpool';
import { schoolDayStatus } from '@/lib/schoolCalendar';
import { formatDayLabel, formatTime } from '@/lib/dateUtils';

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

function shortTime(hhmm: string): string {
  return formatTime(hhmm).replace(/ (AM|PM)$/, '');
}

function MemberRow({ member, dark }: { member: CarMember; dark?: boolean }) {
  return (
    <View style={styles.memberRow}>
      <View style={[styles.avatar, dark ? styles.avatarDark : null]}>
        <Text style={styles.avatarText}>{initials(member.name)}</Text>
      </View>
      <Text style={styles.memberName} numberOfLines={1}>
        {member.name}
      </Text>
      <Text style={styles.memberTime}>{formatTime(member.time)}</Text>
    </View>
  );
}

export function ScheduleScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<Date>(() => new Date());
  const {
    loading,
    error,
    currentUserId,
    assignmentFor,
    hasPass,
    passesLeftThisMonth,
    takePass,
    dropPass,
  } = useCarpool();

  function dayInfo(date: Date): DayWidget {
    const status = schoolDayStatus(date);
    if (status.blocked) return { kind: 'blocked', time: null, label: status.label };
    const a = assignmentFor(date);
    if (!a) return { kind: 'off', time: null, label: status.label };
    return {
      kind: a.role,
      time: a.role === 'unmatched' ? null : shortTime(a.time),
      label: status.label,
    };
  }

  function renderDetail() {
    const status = schoolDayStatus(selected);
    if (status.blocked) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>No school</Text>
          <Text style={styles.infoText}>
            {status.label ?? 'Weekend'} — no carpool this day.
          </Text>
        </View>
      );
    }

    const a = assignmentFor(selected);

    if (!a) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Not carpooling this day</Text>
          <Text style={styles.infoText}>
            Turn this weekday on and set a pickup time to join the rotation.
          </Text>
          {status.label ? <Text style={styles.note}>{status.label}</Text> : null}
          <View style={styles.infoButton}>
            <Button
              title="Edit my schedule"
              onPress={() => navigation.navigate('EditSchedule')}
            />
          </View>
        </View>
      );
    }

    const left = passesLeftThisMonth(selected);
    const usedPass = hasPass(selected);

    return (
      <View style={styles.groupCard}>
        <View style={styles.statusRow}>
          <Text style={a.role === 'unmatched' ? styles.statusWarn : styles.statusGood}>
            {a.role === 'drive'
              ? "You're driving"
              : a.role === 'ride'
                ? "You're being picked up"
                : 'No match yet'}
          </Text>
          <View style={styles.zoneBadge}>
            <Text style={styles.zoneBadgeText}>{a.zone}</Text>
          </View>
        </View>

        {status.label ? <Text style={styles.note}>{status.label}</Text> : null}

        {a.role === 'drive' ? (
          <>
            <Text style={styles.subtle}>Arrive by {formatTime(a.time)}</Text>
            <Text style={styles.sectionLabel}>Your riders ({a.riders.length})</Text>
            {a.riders.length === 0 ? (
              <Text style={styles.infoText}>No riders matched yet.</Text>
            ) : (
              a.riders.map((r) => <MemberRow key={r.userId} member={r} />)
            )}
          </>
        ) : a.role === 'ride' ? (
          <>
            <Text style={styles.subtle}>Pickup at {formatTime(a.time)}</Text>
            <Text style={styles.sectionLabel}>Driver</Text>
            {a.driver ? <MemberRow member={a.driver} dark /> : null}
            {a.riders.filter((r) => r.userId !== currentUserId).length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Riding with you</Text>
                {a.riders
                  .filter((r) => r.userId !== currentUserId)
                  .map((r) => (
                    <MemberRow key={r.userId} member={r} />
                  ))}
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.infoText}>
            No driver available in your area within 30 minutes of your pickup time
            for this day.
          </Text>
        )}

        {/* Hardship pass control */}
        {usedPass ? (
          <View style={styles.hardshipRow}>
            <Text style={styles.hardshipNote}>
              Hardship pass used — you&apos;re not driving this day.
            </Text>
            <TouchableOpacity onPress={() => dropPass(selected)}>
              <Text style={styles.hardshipUndo}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : a.role === 'drive' ? (
          <TouchableOpacity
            style={styles.hardshipBtn}
            disabled={left <= 0}
            onPress={() => takePass(selected)}
          >
            <Text style={[styles.hardshipBtnText, left <= 0 && styles.hardshipDisabled]}>
              Can&apos;t drive this day? Use a hardship pass ({left} left)
            </Text>
          </TouchableOpacity>
        ) : null}
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

        <CalendarPicker selected={selected} onSelect={setSelected} dayInfo={dayInfo} />

        <Text style={styles.dayHeading}>{formatDayLabel(selected)}</Text>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#DC143C" size="large" />
          </View>
        ) : (
          renderDetail()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
  editLink: { fontSize: 15, fontWeight: '700', color: '#DC143C' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  dayHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E232C',
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  loadingArea: { paddingVertical: 32, alignItems: 'center' },
  groupCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusGood: { fontSize: 16, fontWeight: '700', color: '#16A34A' },
  statusWarn: { fontSize: 16, fontWeight: '700', color: '#FF9500' },
  zoneBadge: {
    backgroundColor: '#F7F8F9',
    borderWidth: 1,
    borderColor: '#DADADA',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoneBadgeText: { fontSize: 12, fontWeight: '600', color: '#6A707C' },
  subtle: { fontSize: 13, color: '#6A707C', marginBottom: 8 },
  note: { fontSize: 12, fontWeight: '600', color: '#FF9500', marginBottom: 8 },
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
  avatarDark: { backgroundColor: '#1E232C' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  memberName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1E232C' },
  memberTime: { fontSize: 13, fontWeight: '600', color: '#6A707C' },
  hardshipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF4',
  },
  hardshipNote: { flex: 1, fontSize: 13, color: '#6A707C' },
  hardshipUndo: { fontSize: 14, fontWeight: '700', color: '#DC143C' },
  hardshipBtn: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF4',
  },
  hardshipBtnText: { fontSize: 14, fontWeight: '600', color: '#DC143C' },
  hardshipDisabled: { color: '#C9CDD4' },
  infoCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 6,
  },
  infoText: { fontSize: 14, color: '#6A707C', lineHeight: 20 },
  infoButton: { marginTop: 16 },
});
