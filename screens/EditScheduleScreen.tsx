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
import type { DayRole, ScheduleStackParamList, WeekdayKey } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { TimePickerClock } from '@/components/ui/TimePickerClock';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useMySchedule } from '@/hooks/useMySchedule';
import { WEEKDAYS, formatTime } from '@/lib/dateUtils';

type EditScheduleNavigationProp = StackNavigationProp<
  ScheduleStackParamList,
  'EditSchedule'
>;

interface Props {
  navigation: EditScheduleNavigationProp;
}

const ROLES: { value: DayRole; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'ride', label: 'Ride' },
  { value: 'drive', label: 'Drive' },
];

const DEFAULT_TIME = '15:15';

export function EditScheduleScreen({ navigation }: Props) {
  const { days, loading, error, carCapacity, setDay } = useMySchedule();
  const [openDay, setOpenDay] = useState<WeekdayKey | null>(null);

  const canDrive = carCapacity >= 1;

  function handleRole(day: WeekdayKey, role: DayRole): void {
    if (role === 'drive' && !canDrive) return;
    const time = role === 'off' ? null : days[day].dismissalTime ?? DEFAULT_TIME;
    void setDay(day, role, time);
  }

  function handleConfirmTime(value: string): void {
    if (openDay) void setDay(openDay, days[openDay].role, value);
    setOpenDay(null);
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Edit my schedule</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorMessage message={error} /> : null}

        <Text style={styles.intro}>
          Set whether you&apos;re driving, riding, or off for each weekday, and
          your child&apos;s pickup time (3:15–6:00 PM). You&apos;re paired
          automatically with nearby families at a similar time.
        </Text>

        {!canDrive ? (
          <Text style={styles.note}>
            Add your car seats in Profile to enable “Drive.”
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#DC143C" size="large" />
          </View>
        ) : (
          WEEKDAYS.map(({ key, label }) => {
            const day = days[key];
            return (
              <View key={key} style={styles.dayCard}>
                <Text style={styles.dayLabel}>{label}</Text>
                <View style={styles.segments}>
                  {ROLES.map((r) => {
                    const active = day.role === r.value;
                    const disabled = r.value === 'drive' && !canDrive;
                    return (
                      <TouchableOpacity
                        key={r.value}
                        disabled={disabled}
                        onPress={() => handleRole(key, r.value)}
                        style={[
                          styles.segment,
                          active ? styles.segmentActive : null,
                          disabled ? styles.segmentDisabled : null,
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            active ? styles.segmentTextActive : null,
                            disabled ? styles.segmentTextDisabled : null,
                          ]}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {day.role !== 'off' ? (
                  <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => setOpenDay(key)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.timeLabel}>Pickup time</Text>
                    <Text style={styles.timeValue}>
                      {formatTime(day.dismissalTime) || 'Set time →'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <TimePickerClock
        visible={openDay !== null}
        value={openDay ? days[openDay].dismissalTime : null}
        onConfirm={handleConfirmTime}
        onCancel={() => setOpenDay(null)}
      />
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1E232C',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  intro: {
    fontSize: 14,
    color: '#6A707C',
    lineHeight: 20,
    marginBottom: 12,
  },
  note: {
    fontSize: 13,
    color: '#DC143C',
    fontWeight: '500',
    marginBottom: 16,
  },
  loadingArea: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  dayCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 12,
  },
  segments: {
    flexDirection: 'row',
    backgroundColor: '#F7F8F9',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#DC143C',
  },
  segmentDisabled: {
    opacity: 0.5,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6A707C',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  segmentTextDisabled: {
    color: '#C9CDD4',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E232C',
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC143C',
  },
});
