import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MessagesStackParamList } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { webScreenFix } from '@/components/ui/FormScroll';
import { useMessages, type ChatMessage } from '@/hooks/useMessages';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { formatTime } from '@/lib/dateUtils';

type ConversationNavigationProp = StackNavigationProp<
  MessagesStackParamList,
  'Conversation'
>;
type ConversationRouteProp = RouteProp<MessagesStackParamList, 'Conversation'>;

interface Props {
  navigation: ConversationNavigationProp;
  route: ConversationRouteProp;
}

const FIVE_MIN = 5 * 60 * 1000;

interface DecoratedMessage {
  message: ChatMessage;
  mine: boolean;
  showName: boolean; // first of a sender-group (others, group chats only)
  showTime: boolean; // last of a sender-group
  gapTop: number;
}

function within5(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= FIVE_MIN;
}

/** "3:45 PM" from a full ISO timestamp. */
function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatTime(
    `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`,
  );
}

export function ConversationScreen({ navigation, route }: Props) {
  const { conversationId, title } = route.params;
  const { messages, loading, error, sendMessage } = useMessages(conversationId);
  const { user } = useCurrentUser();
  const currentUserId = user?.id ?? null;
  const tabBarHeight = useBottomTabBarHeight();

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);

  const listRef = useRef<FlatList<DecoratedMessage>>(null);

  // Determine whether this is a group chat (controls showing sender names).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from('conversations')
          .select('type')
          .eq('id', conversationId)
          .single();
        if (active && data) setIsGroup((data as { type: string }).type === 'group');
      } catch {
        // Non-fatal: default (false) just hides sender names.
      }
    })();
    return () => {
      active = false;
    };
  }, [conversationId]);

  // Mark the conversation read on focus and whenever new messages arrive while
  // it is focused, so the unread badge clears.
  const markRead = useCallback(async (): Promise<void> => {
    if (!currentUserId) return;
    try {
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId);
    } catch {
      // Non-fatal: the badge will simply update on the next read.
    }
  }, [conversationId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      void markRead();
    }, [markRead]),
  );

  useEffect(() => {
    if (messages.length > 0) void markRead();
  }, [messages.length, markRead]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const decorated: DecoratedMessage[] = messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const mine = m.sender_id === currentUserId;
    const sameAsPrev =
      !!prev &&
      prev.sender_id === m.sender_id &&
      within5(prev.created_at, m.created_at);
    const sameAsNext =
      !!next &&
      next.sender_id === m.sender_id &&
      within5(m.created_at, next.created_at);
    return {
      message: m,
      mine,
      showName: !mine && isGroup && !sameAsPrev,
      showTime: !sameAsNext,
      gapTop: i === 0 ? 0 : sameAsPrev ? 4 : 12,
    };
  });

  async function handleSend(): Promise<void> {
    const text = draft.trim();
    if (!text) return;
    setDraft(''); // optimistic clear
    setSendError(null);
    try {
      await sendMessage(text);
      scrollToEnd();
    } catch {
      setDraft(text); // restore on failure
      setSendError('Message failed to send. Please try again.');
    }
  }

  function renderItem({ item }: { item: DecoratedMessage }) {
    const { message, mine, showName, showTime, gapTop } = item;
    return (
      <View style={[styles.msgWrap, { marginTop: gapTop }]}>
        {showName ? (
          <Text style={styles.senderName}>{message.senderName}</Text>
        ) : null}
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
        >
          <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
            {message.content}
          </Text>
        </View>
        {showTime ? (
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>
            {timeOf(message.created_at)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webScreenFix]} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={tabBarHeight}
      >
        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#DC143C" size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={decorated}
            keyExtractor={(item) => item.message.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={scrollToEnd}
            onLayout={scrollToEnd}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyArea}>
                <Text style={styles.emptyText}>No messages yet.</Text>
                <Text style={styles.emptyHint}>Say hello 👋</Text>
              </View>
            }
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: 10 }]}>
          {error ? <ErrorMessage message={error} /> : null}
          {sendError ? <ErrorMessage message={sendError} /> : null}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor="#8391A1"
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
              onPress={() => void handleSend()}
              disabled={!draft.trim()}
              accessibilityLabel="Send message"
            >
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
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
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1E232C',
    textAlign: 'center',
  },
  headerSpacer: { width: 41 }, // balances the BackButton so the title centers
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, flexGrow: 1 },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyText: { fontSize: 15, color: '#8391A1', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#8391A1' },
  msgWrap: { maxWidth: '80%' },
  senderName: {
    fontSize: 11,
    color: '#6A707C',
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  bubbleMine: {
    backgroundColor: '#DC143C',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  bubbleTheirs: {
    backgroundColor: '#F7F8F9',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  bubbleTextMine: { fontSize: 15, color: '#FFFFFF', lineHeight: 20 },
  bubbleTextTheirs: { fontSize: 15, color: '#1E232C', lineHeight: 20 },
  time: { fontSize: 11, color: '#8391A1', marginTop: 3 },
  timeMine: { alignSelf: 'flex-end', marginRight: 4 },
  timeTheirs: { alignSelf: 'flex-start', marginLeft: 4 },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: '#DADADA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F7F8F9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    fontWeight: '500',
    color: '#1E232C',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
