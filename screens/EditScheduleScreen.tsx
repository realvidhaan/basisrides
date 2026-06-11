import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ScheduleStackParamList, WeekdayKey } from '@/types';
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

const DEFAULT_TIME = '15:15';

export function EditScheduleScreen({ navigation }: Props) {
  const { days, loading, error, carCapacity, setDay } = useMySchedule();
  const [openDay, setOpenDay] = useState<WeekdayKey | null>(null);

  const canDriveCount = WEEKDAYS.filter(
    ({ key }) => days[key].participating && days[key].canDrive,
  ).length;
  const hasCar = carCapacity >= 1;

  function handleToggle(day: WeekdayKey, on: boolean): void {
    void setDay(
      day,
      on,
      on ? days[day].dismissalTime ?? DEFAULT_TIME : null,
      on ? days[day].canDrive : false,
    );
  }

  function handleConfirmTime(value: string): void {
    if (openDay) void setDay(openDay, true, value, days[openDay].canDrive);
    setOpenDay(null);
  }

  function handleDriveToggle(day: WeekdayKey, canDrive: boolean): void {
    void setDay(
      day,
      true,
      days[day].dismissalTime ?? DEFAULT_TIME,
      canDrive,
    );
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
          Turn on the weekdays you need carpool and set your child&apos;s pickup
          time (3:15–6:00 PM). Then mark the days you can drive — the app shares
          driving fairly among everyone who volunteers, so you only drive a
          couple of days a week. Use &quot;Ask someone to cover&quot; on the calendar
          if you can&apos;t drive on a day you&apos;re scheduled to.
        </Text>
        {!hasCar ? (
          <Text style={styles.note}>
            You have no car seats set, so you&apos;ll only ever be a rider. Add
            seats in Profile to share driving.
          </Text>
        ) : (
          <Text
            style={[styles.note, canDriveCount < 2 ? styles.noteWarn : null]}
          >
            {canDriveCount < 2
              ? `Please pick at least 2 days you can drive (you've picked ${canDriveCount}). The more days everyone offers, the fewer times each parent drives.`
              : `You can drive on ${canDriveCount} days — the rotation will pick roughly 2 of them for you each week.`}
          </Text>
        )}

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#DC143C" size="large" />
          </View>
        ) : (
          WEEKDAYS.map(({ key, label }) => {
            const day = days[key];
            return (
              <View key={key} style={styles.dayCard}>
                <View style={styles.dayHeaderRow}>
                  <Text style={styles.dayLabel}>{label}</Text>
                  <Switch
                    value={day.participating}
                    onValueChange={(v) => handleToggle(key, v)}
                    trackColor={{ false: '#E8ECF4', true: '#DC143C' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#E8ECF4"
                  />
                </View>
                {day.participating ? (
                  <>
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
                    {hasCar ? (
                      <View style={styles.driveRow}>
                        <View style={styles.driveLabelWrap}>
                          <Text style={styles.driveLabel}>I can drive</Text>
                          <Text style={styles.driveHint}>
                            Offer to drive this day
                          </Text>
                        </View>
                        <Switch
                          value={day.canDrive}
                          onValueChange={(v) => handleDriveToggle(key, v)}
                          trackColor={{ false: '#E8ECF4', true: '#16A34A' }}
                          thumbColor="#FFFFFF"
                          ios_backgroundColor="#E8ECF4"
                        />
                      </View>
                    ) : null}
                  </>
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
  title: { fontSize: 20, fontWeight: '700', color: '#1E232C' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#6A707C', lineHeight: 20, marginBottom: 10 },
  note: {
    fontSize: 13,
    color: '#1E232C',
    fontWeight: '500',
    marginBottom: 16,
  },
  noteWarn: {
    color: '#B45309',
  },
  loadingArea: { paddingVertical: 32, alignItems: 'center' },
  dayCard: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: { fontSize: 16, fontWeight: '700', color: '#1E232C' },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
  },
  timeLabel: { fontSize: 14, fontWeight: '500', color: '#1E232C' },
  timeValue: { fontSize: 15, fontWeight: '700', color: '#DC143C' },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF4',
  },
  driveLabelWrap: { flex: 1 },
  driveLabel: { fontSize: 14, fontWeight: '600', color: '#16A34A' },
  driveHint: { fontSize: 12, color: '#8391A1', marginTop: 2 },
});
