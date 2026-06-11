import React from 'react';
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
import type { SwapView } from '@/hooks/useSwaps';
import { BackButton } from '@/components/ui/BackButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useSwaps } from '@/hooks/useSwaps';
import { formatDayLabel, parseISO } from '@/lib/dateUtils';

type Nav = StackNavigationProp<ScheduleStackParamList, 'Swaps'>;

interface Props {
  navigation: Nav;
}

const STATUS_LABEL: Record<SwapView['status'], string> = {
  open: 'Waiting for cover',
  filled: 'Covered',
  cancelled: 'Cancelled',
};

export function SwapsScreen({ navigation }: Props) {
  const {
    openRequests,
    myRequests,
    loading,
    error,
    cancelSwap,
    acceptSwap,
  } = useSwaps();

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Cover requests</Text>
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

          <Text style={styles.intro}>
            When a parent can&apos;t drive their assigned day, they ask for cover
            here. If you have a car, you can step in — it&apos;s the friendly
            alternative to a hardship pass.
          </Text>

          <Text style={styles.sectionTitle}>Open requests</Text>
          {openRequests.length === 0 ? (
            <Text style={styles.empty}>No one needs cover right now.</Text>
          ) : (
            openRequests.map((s) => (
              <View key={s.id} style={styles.card}>
                <Text style={styles.cardName}>{s.requesterName}</Text>
                <Text style={styles.cardDay}>
                  Needs cover for {formatDayLabel(parseISO(s.day))}
                </Text>
                {s.requesterZone ? (
                  <Text style={styles.cardZone}>{s.requesterZone}</Text>
                ) : null}
                {s.note ? <Text style={styles.cardNote}>“{s.note}”</Text> : null}
                <TouchableOpacity
                  style={styles.coverBtn}
                  onPress={() => void acceptSwap(s.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.coverBtnText}>I&apos;ll cover this drive</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, styles.sectionGap]}>
            Your requests
          </Text>
          {myRequests.length === 0 ? (
            <Text style={styles.empty}>
              You haven&apos;t asked anyone to cover a drive.
            </Text>
          ) : (
            myRequests.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.myTop}>
                  <Text style={styles.cardDay}>
                    {formatDayLabel(parseISO(s.day))}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      s.status === 'filled'
                        ? styles.badgeFilled
                        : s.status === 'open'
                          ? styles.badgeOpen
                          : styles.badgeCancelled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        s.status === 'filled'
                          ? styles.badgeTextFilled
                          : s.status === 'open'
                            ? styles.badgeTextOpen
                            : styles.badgeTextCancelled,
                      ]}
                    >
                      {STATUS_LABEL[s.status]}
                    </Text>
                  </View>
                </View>
                {s.note ? <Text style={styles.cardNote}>“{s.note}”</Text> : null}
                {s.status === 'open' ? (
                  <TouchableOpacity onPress={() => void cancelSwap(s.id)}>
                    <Text style={styles.cancelText}>Cancel request</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
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
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1E232C' },
  headerSpacer: { width: 41 },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#6A707C', lineHeight: 20, marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E232C',
    marginBottom: 12,
  },
  sectionGap: { marginTop: 24 },
  empty: { fontSize: 14, color: '#8391A1', marginBottom: 8 },
  card: {
    borderWidth: 1.5,
    borderColor: '#E8ECF4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1E232C' },
  cardDay: { fontSize: 14, fontWeight: '600', color: '#1E232C', marginTop: 2 },
  cardZone: { fontSize: 13, color: '#8391A1', marginTop: 2 },
  cardNote: { fontSize: 14, color: '#6A707C', marginTop: 8, fontStyle: 'italic' },
  coverBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#DC143C',
    alignItems: 'center',
  },
  coverBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  myTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOpen: { backgroundColor: '#FFF1F1' },
  badgeFilled: { backgroundColor: '#F0FDF4' },
  badgeCancelled: { backgroundColor: '#F1F3F5' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextOpen: { color: '#DC143C' },
  badgeTextFilled: { color: '#16A34A' },
  badgeTextCancelled: { color: '#8391A1' },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC143C',
    marginTop: 12,
  },
});
