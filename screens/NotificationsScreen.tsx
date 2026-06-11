import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type {
  AppNotification,
  MainTabParamList,
  ScheduleStackParamList,
} from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useNotifications } from '@/hooks/useNotifications';

type Nav = CompositeNavigationProp<
  StackNavigationProp<ScheduleStackParamList, 'Notifications'>,
  BottomTabNavigationProp<MainTabParamList>
>;

interface Props {
  navigation: Nav;
}

function iconFor(type: string): string {
  switch (type) {
    case 'message':
      return '💬';
    case 'trip':
      return '🚗';
    case 'pickup':
      return '✅';
    case 'invite':
      return '🎉';
    default:
      return '🔔';
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function NotificationsScreen({ navigation }: Props) {
  const { notifications, loading, error, markAllRead } = useNotifications();

  // Opening the screen marks everything read.
  useEffect(() => {
    void markAllRead();
  }, [markAllRead]);

  function handlePress(n: AppNotification): void {
    const data = n.data ?? {};
    if (n.type === 'message') {
      const conversationId = asString(data.conversation_id);
      const title = asString(data.conversation_title) ?? 'Conversation';
      if (conversationId) {
        navigation.navigate('MessagesTab', {
          screen: 'Conversation',
          params: { conversationId, title },
        });
      }
      return;
    }
    if (n.type === 'trip' || n.type === 'pickup') {
      const date = asString(data.ride_date);
      if (date) navigation.navigate('LiveTrip', { date });
    }
  }

  function renderItem({ item }: { item: AppNotification }) {
    const unread = item.read_at === null;
    return (
      <TouchableOpacity
        style={[styles.row, unread && styles.rowUnread]}
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
      >
        <Text style={styles.icon}>{iconFor(item.type)}</Text>
        <View style={styles.body}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.body ? (
            <Text style={styles.rowBody} numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}
        </View>
        <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.headerSpacer} />
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
      ) : notifications.length === 0 ? (
        <View style={styles.emptyArea}>
          <Text style={styles.emptyTitle}>You&apos;re all caught up.</Text>
          <Text style={styles.emptyHint}>
            Carpool updates, messages and pickups show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
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
  errorWrap: { paddingHorizontal: 20, paddingTop: 12 },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 15, color: '#8391A1', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#8391A1', textAlign: 'center' },
  listContent: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  rowUnread: { backgroundColor: '#FFF6F6' },
  icon: { fontSize: 22 },
  body: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#1E232C' },
  rowBody: { fontSize: 13, color: '#6A707C', marginTop: 3 },
  time: { fontSize: 12, color: '#8391A1' },
  separator: { height: 1, backgroundColor: '#E8ECF4', marginLeft: 56 },
});
