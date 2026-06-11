import React from 'react';
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
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ConversationPreview, MessagesStackParamList } from '@/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useConversations } from '@/hooks/useConversations';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatMonthDay, formatTime, parseISO } from '@/lib/dateUtils';

type MessagesListNavigationProp = StackNavigationProp<
  MessagesStackParamList,
  'MessagesList'
>;

interface Props {
  navigation: MessagesListNavigationProp;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "3:45 PM" if today, otherwise "Jun 9". */
function shortStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (isSameDay(d, now)) {
    return formatTime(
      `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`,
    );
  }
  return formatMonthDay(d);
}

function dmTitle(
  preview: ConversationPreview,
  currentUserId: string | null,
): string {
  const other = preview.participants.find((p) => p.id !== currentUserId);
  return other?.name ?? 'Direct message';
}

function groupTitle(preview: ConversationPreview): string {
  if (preview.conversation.ride_date) {
    return `Carpool · ${formatMonthDay(parseISO(preview.conversation.ride_date))}`;
  }
  return preview.conversation.title ?? 'Carpool group';
}

export function MessagesListScreen({ navigation }: Props) {
  const { conversations, loading, error } = useConversations();
  const { user } = useCurrentUser();
  const currentUserId = user?.id ?? null;

  function previewLine(preview: ConversationPreview): string {
    const msg = preview.lastMessage;
    if (!msg) return 'No messages yet';
    const sender =
      msg.sender_id === currentUserId
        ? 'You'
        : (preview.participants.find((p) => p.id === msg.sender_id)?.name ??
          'Member');
    const senderFirst = sender.split(/\s+/)[0];
    const body =
      msg.content.length > 40 ? `${msg.content.slice(0, 40)}…` : msg.content;
    return `${senderFirst}: ${body}`;
  }

  function renderItem({ item }: { item: ConversationPreview }) {
    const isGroup = item.conversation.type === 'group';
    const title = isGroup ? groupTitle(item) : dmTitle(item, currentUserId);
    const stamp = item.lastMessage ? shortStamp(item.lastMessage.created_at) : '';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('Conversation', {
            conversationId: item.conversation.id,
            title,
          })
        }
      >
        <View style={[styles.avatar, isGroup ? styles.avatarGroup : null]}>
          {isGroup ? (
            <Text style={styles.avatarEmoji}>🚗</Text>
          ) : (
            <Text style={styles.avatarText}>{initials(title)}</Text>
          )}
        </View>

        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {previewLine(item)}
          </Text>
        </View>

        <View style={styles.rowEnd}>
          {item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 9 ? '9+' : item.unreadCount}
              </Text>
            </View>
          ) : stamp ? (
            <Text style={styles.stamp}>{stamp}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
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
      ) : conversations.length === 0 ? (
        <View style={styles.emptyArea}>
          <Text style={styles.emptyTitle}>No conversations yet.</Text>
          <Text style={styles.emptyHint}>Start chatting from a carpool day.</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation.id}
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
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DADADA',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1E232C' },
  errorWrap: { paddingHorizontal: 24, paddingTop: 12 },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 15, color: '#8391A1', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#8391A1' },
  listContent: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGroup: { backgroundColor: '#FFF1F1' },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  avatarEmoji: { fontSize: 22 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#1E232C' },
  rowPreview: { fontSize: 13, color: '#6A707C', marginTop: 3 },
  rowEnd: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 36 },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  stamp: { fontSize: 12, color: '#8391A1' },
  separator: {
    height: 1,
    backgroundColor: '#E8ECF4',
    marginLeft: 82,
  },
});
