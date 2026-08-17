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
import type { StackNavigationProp } from '@react-navigation/stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type {
  DayWidget,
  MainTabParamList,
  ScheduleStackParamList,
} from '@/types';
import type { CarMember } from '@/lib/pairing';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import { CarIllustration } from '@/components/CarIllustration';
import { ImpactStrip } from '@/components/ui/ImpactStrip';
import { Logo } from '@/components/brand/Logo';
import { carColorLabel, carTypeLabel } from '@/lib/carOptions';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useCarpool } from '@/hooks/useCarpool';
import { useImpact } from '@/hooks/useImpact';
import { useNotifications } from '@/hooks/useNotifications';
import { useSwaps } from '@/hooks/useSwaps';
import { nextSchoolDay, schoolDayStatus } from '@/lib/schoolCalendar';
import { formatDayLabel, formatMonthDay, formatTime, toISO } from '@/lib/dateUtils';
import { getOrCreateDM, getOrCreateGroupChat } from '@/lib/conversationUtils';
import { DEMO_MODE } from '@/lib/demoMode';
import { demoInitialDate } from '@/lib/demo/fixtures';
import { colors } from '@/constants/theme/colors';

// Composite so this screen can jump to the Messages tab's Conversation screen.
type ScheduleNavigationProp = CompositeNavigationProp<
  StackNavigationProp<ScheduleStackParamList, 'Schedule'>,
  BottomTabNavigationProp<MainTabParamList>
>;

interface Props {
  navigation: ScheduleNavigationProp;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortTime(hhmm: string): string {
  return formatTime(hhmm).replace(/ (AM|PM)$/, '');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// The driver's vehicle, so a waiting parent can spot the right car at pickup.
function CarCard({ driver, label }: { driver: CarMember; label: string }) {
  const { car } = driver;
  return (
    <View style={styles.carCard}>
      <CarIllustration colorKey={car.color} type={car.type} size={96} />
      <View style={styles.carInfo}>
        <Text style={styles.carLabel}>{label}</Text>
        <Text style={styles.carModel} numberOfLines={1}>
          {car.model && car.model.trim()
            ? car.model
            : `${carColorLabel(car.color)} ${carTypeLabel(car.type).toLowerCase()}`}
        </Text>
        <Text style={styles.carMeta}>
          {carColorLabel(car.color)} · {carTypeLabel(car.type)}
        </Text>
        {car.plate && car.plate.trim() ? (
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{car.plate.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MemberRow({
  member,
  dark,
  onMessage,
}: {
  member: CarMember;
  dark?: boolean;
  onMessage?: () => void;
}) {
  return (
    <View style={styles.memberRow}>
      <View style={[styles.avatar, dark ? styles.avatarDark : null]}>
        <Text style={styles.avatarText}>{initials(member.name)}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.name}
        </Text>
        {member.address ? (
          <Text style={styles.memberAddress} numberOfLines={1}>
            {member.address}
          </Text>
        ) : null}
      </View>
      <Text style={styles.memberTime}>{formatTime(member.time)}</Text>
      {onMessage ? (
        <TouchableOpacity
          onPress={onMessage}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Message ${member.name}`}
          style={styles.dmIcon}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ScheduleScreen({ navigation }: Props) {
  // Open on the nearest day that actually has a carpool. Defaulting to "today"
  // lands on a weekend, a break, or (before the year opens) summer, and the
  // resulting empty state reads as if the app is broken.
  //
  // The demo skips one step further, past early-dismissal days: lib/pairing.ts
  // overrides every pickup time to 1:00 PM on those, so the time the presenter
  // just set on stage would appear to have been ignored. The production path is
  // unchanged.
  const [selected, setSelected] = useState<Date>(() =>
    DEMO_MODE ? demoInitialDate() : nextSchoolDay(new Date()),
  );
  const [chatError, setChatError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const {
    loading,
    error,
    currentUserId,
    assignmentFor,
    hasSkip,
    takeSkip,
    dropSkip,
  } = useCarpool();
  const { unreadCount } = useNotifications();
  const { openCount, requestCover, error: swapError } = useSwaps();
  const { totals: impact } = useImpact(currentUserId);

  async function askForCover(): Promise<void> {
    const ok = await requestCover(toISO(selected), '');
    if (ok) navigation.navigate('Swaps');
    // On failure useSwaps sets `swapError`, rendered below — without it the tap
    // did nothing at all: no navigation, no message, no spinner.
  }

  function goToConversation(conversationId: string, title: string): void {
    navigation.navigate('MessagesTab', {
      screen: 'Conversation',
      // Without this React Navigation initialises the Messages stack with
      // Conversation as its ONLY route the first time we jump into that tab, so
      // the chat's back button has nothing to pop to and does nothing.
      initial: false,
      params: { conversationId, title },
    });
  }

  async function openGroupChat(): Promise<void> {
    if (opening) return;
    const a = assignmentFor(selected);
    if (!a) return;
    setChatError(null);
    setOpening(true);
    try {
      const ids = new Set<string>();
      if (currentUserId) ids.add(currentUserId);
      if (a.driver) ids.add(a.driver.userId);
      for (const r of a.riders) ids.add(r.userId);
      const id = await getOrCreateGroupChat(toISO(selected), Array.from(ids));
      goToConversation(id, `Carpool · ${formatMonthDay(selected)}`);
    } catch {
      setChatError('Could not open the group chat. Please try again.');
    } finally {
      setOpening(false);
    }
  }

  async function openDM(userId: string, name: string): Promise<void> {
    if (opening || !currentUserId) return;
    setChatError(null);
    setOpening(true);
    try {
      const id = await getOrCreateDM(currentUserId, userId);
      goToConversation(id, name);
    } catch {
      setChatError('Could not open this conversation. Please try again.');
    } finally {
      setOpening(false);
    }
  }

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

    if (hasSkip(selected)) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>You&apos;re skipping this day</Text>
          <Text style={styles.infoText}>
            Your child isn&apos;t carpooling on this day. Undo to rejoin the
            rotation.
          </Text>
          <View style={styles.infoButton}>
            <Button
              title="Undo skip"
              variant="outline"
              onPress={() => void dropSkip(selected)}
            />
          </View>
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

    return (
      <View style={styles.groupCard}>
        <View style={styles.statusRow}>
          <Text
            style={
              a.role === 'drive'
                ? styles.statusDrive
                : a.role === 'ride'
                  ? styles.statusGood
                  : styles.statusWarn
            }
          >
            {a.role === 'drive'
              ? '🚗 You’re driving'
              : a.role === 'ride'
                ? '🧍 You’re being picked up'
                : 'No match yet'}
          </Text>
          <View style={styles.zoneBadge}>
            <Text style={styles.zoneBadgeText}>{a.zone}</Text>
          </View>
        </View>

        {status.label ? <Text style={styles.note}>{status.label}</Text> : null}

        {chatError ? <ErrorMessage message={chatError} /> : null}

        {a.role === 'drive' ? (
          <>
            <Text style={styles.subtle}>Arrive by {formatTime(a.time)}</Text>
            <Text style={styles.sectionLabel}>Your riders ({a.riders.length})</Text>
            {a.riders.length === 0 ? (
              <Text style={styles.infoText}>No riders matched yet.</Text>
            ) : (
              a.riders.map((r) => (
                <MemberRow
                  key={r.userId}
                  member={r}
                  onMessage={() => void openDM(r.userId, r.name)}
                />
              ))
            )}
          </>
        ) : a.role === 'ride' ? (
          <>
            <Text style={styles.subtle}>Pickup at {formatTime(a.time)}</Text>
            <Text style={styles.sectionLabel}>Driver</Text>
            {a.driver ? <MemberRow member={a.driver} dark /> : null}
            {a.driver ? (
              <CarCard
                driver={a.driver}
                label={`${firstName(a.driver.name)}'s car`}
              />
            ) : null}
            {a.riders.filter((r) => r.userId !== currentUserId).length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Riding with you</Text>
                {a.riders
                  .filter((r) => r.userId !== currentUserId)
                  .map((r) => (
                    <MemberRow
                      key={r.userId}
                      member={r}
                      onMessage={() => void openDM(r.userId, r.name)}
                    />
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

        {/* Live trip + map — for anyone in a matched car */}
        {a.role === 'drive' || a.role === 'ride' ? (
          <TouchableOpacity
            style={styles.tripBtn}
            onPress={() => navigation.navigate('LiveTrip', { date: toISO(selected) })}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={16} color={colors.surfaceWhite} />
            <Text style={styles.tripBtnText}>
              {a.role === 'drive' ? 'Open live trip' : 'Track ride'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Group chat — available to everyone in a matched car (driver + riders) */}
        {a.role === 'drive' || a.driver ? (
          <TouchableOpacity
            style={styles.groupChatBtn}
            onPress={() => void openGroupChat()}
            disabled={opening}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={16} color={colors.brandTeal} />
            <Text style={styles.groupChatText}>Group chat</Text>
          </TouchableOpacity>
        ) : null}

        {/* Ask a peer to cover your drive */}
        {a.role === 'drive' ? (
          <TouchableOpacity style={styles.coverBtn} onPress={() => void askForCover()}>
            <Text style={styles.coverBtnText}>Ask someone to cover this drive</Text>
          </TouchableOpacity>
        ) : null}

        {/* One-off "we're not going" skip (removes you from the day entirely) */}
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => void takeSkip(selected)}
        >
          <Text style={styles.skipText}>Not going this day? Skip carpool</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        {/* Mark-only: the header row already carries 2 icon buttons + an
            "Edit Schedule" link, so a full mark+wordmark lockup (sized for a
            standalone screen, per the design handoff) risks overflowing on
            narrow phones. The wordmark lives on Welcome; the tab bar already
            labels this screen "Schedule". */}
        <Logo size="header" layout="inline" showWordmark={false} />
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Swaps')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Cover requests"
            style={styles.bell}
            activeOpacity={0.6}
          >
            <Ionicons name="swap-horizontal" size={22} color={colors.ink} />
            {openCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {openCount > 9 ? '9+' : openCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Notifications"
            style={styles.bell}
            activeOpacity={0.6}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditSchedule')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
          >
            <Text style={styles.editLink}>Edit Schedule</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorMessage message={error} /> : null}
        {swapError ? <ErrorMessage message={swapError} /> : null}

        {/* Above the calendar so the payoff for carpooling is the first thing on
            screen. It hides itself until there's history, so a new account sees
            the calendar exactly where it has always been. */}
        <ImpactStrip totals={impact} />

        <CalendarPicker selected={selected} onSelect={setSelected} dayInfo={dayInfo} />

        <Text style={styles.dayHeading}>{formatDayLabel(selected)}</Text>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color={colors.brandTeal} size="large" />
          </View>
        ) : (
          renderDetail()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWhite },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  editLink: { fontSize: 15, fontWeight: '700', color: colors.brandTeal },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  dayHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  loadingArea: { paddingVertical: 32, alignItems: 'center' },
  groupCard: {
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
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
  statusGood: { fontSize: 16, fontWeight: '700', color: colors.success },
  statusDrive: { fontSize: 16, fontWeight: '700', color: colors.brandTeal },
  statusWarn: { fontSize: 16, fontWeight: '700', color: colors.warning },
  zoneBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoneBadgeText: { fontSize: 12, fontWeight: '600', color: colors.inkSecondary },
  subtle: { fontSize: 13, color: colors.inkSecondary, marginBottom: 8 },
  note: { fontSize: 12, fontWeight: '600', color: colors.warning, marginBottom: 8 },
  carCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  carInfo: { flex: 1 },
  carLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  carModel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  carMeta: { fontSize: 13, color: colors.inkSecondary, marginTop: 1 },
  plateBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: colors.surfaceWhite,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  plateText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 1.5,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
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
    backgroundColor: colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDark: { backgroundColor: colors.ink },
  avatarText: { color: colors.surfaceWhite, fontSize: 13, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '500', color: colors.ink },
  memberAddress: { fontSize: 13, fontWeight: '500', color: colors.textMuted, marginTop: 1 },
  memberTime: { fontSize: 13, fontWeight: '600', color: colors.inkSecondary },
  dmIcon: { marginLeft: 12, padding: 2 },
  groupChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  groupChatText: { fontSize: 14, fontWeight: '700', color: colors.brandTeal },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  bell: { position: 'relative' },
  bellBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: colors.surfaceWhite, fontSize: 10, fontWeight: '700' },
  tripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: colors.brandTeal,
  },
  tripBtnText: { fontSize: 15, fontWeight: '700', color: colors.surfaceWhite },
  coverBtn: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  coverBtnText: { fontSize: 14, fontWeight: '600', color: colors.brandTeal },
  skipBtn: { marginTop: 14, alignItems: 'center' },
  skipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  infoCard: {
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 6,
  },
  infoText: { fontSize: 14, color: colors.inkSecondary, lineHeight: 20 },
  infoButton: { marginTop: 16 },
});
