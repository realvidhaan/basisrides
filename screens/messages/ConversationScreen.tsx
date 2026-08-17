import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
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
import { blockUser, reportUser } from '@/lib/moderation';
import { formatTime } from '@/lib/dateUtils';
import { DEMO_MODE } from '@/lib/demoMode';
import { onDemoTyping } from '@/lib/demo/script';
import { colors } from '@/constants/theme/colors';

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

/**
 * The demo bot's "•••" bubble, in the other-sender bubble style.
 *
 * A list FOOTER rather than a row: it must sit below the last message and scroll
 * with it, and modelling it as a fake message would put it in `messages`, where
 * the block filter, the sender-grouping decoration and `keyExtractor` would all
 * have to learn about something that is not a message.
 *
 * Demo-only — nothing schedules `typing` in a production build.
 */
function TypingBubble() {
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      wave.setValue(0);
    };
  }, [wave]);

  // One driver, three phase-shifted opacities: the dots ripple left to right.
  const opacityFor = (index: number) =>
    wave.interpolate({
      inputRange: [0, 0.2 + index * 0.15, 0.5 + index * 0.15, 1],
      outputRange: [0.3, 1, 0.3, 0.3],
    });

  return (
    <View style={[styles.msgWrap, { marginTop: 12 }]}>
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typingBubble]}>
        {[0, 1, 2].map((i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: opacityFor(i) }]} />
        ))}
      </View>
    </View>
  );
}

export function ConversationScreen({ navigation, route }: Props) {
  const { conversationId, title } = route.params;
  const { messages, loading, error, sendMessage, refreshBlocks } =
    useMessages(conversationId);
  const { user } = useCurrentUser();
  const currentUserId = user?.id ?? null;
  const tabBarHeight = useBottomTabBarHeight();

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);

  const listRef = useRef<FlatList<DecoratedMessage>>(null);
  const sendingRef = useRef(false);
  const isFocused = useIsFocused();

  // Demo only: the scripted bot's ••• state for this conversation. Unsubscribing
  // on unmount is what stops an indicator outliving the screen — the footer goes
  // with the component, and a remount is re-seeded with the current value.
  const [botTyping, setBotTyping] = useState(false);
  useEffect(() => {
    if (!DEMO_MODE) return;
    return onDemoTyping(conversationId, setBotTyping);
  }, [conversationId]);

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
    } catch (e) {
      Sentry.captureException(e);
      // Non-fatal: the badge will simply update on the next read.
    }
  }, [conversationId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      void markRead();
    }, [markRead]),
  );

  useEffect(() => {
    // Only mark read while the screen is actually focused. The component stays
    // mounted in the tab/stack, so without the focus check a message arriving
    // while the user is on another screen would clear its unread badge unseen.
    if (isFocused && messages.length > 0) void markRead();
  }, [isFocused, messages.length, markRead]);

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
    // sendingRef blocks a same-frame double-tap (the disabled prop only updates
    // on the next render), which would otherwise insert the message twice.
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setDraft(''); // optimistic clear
    setSendError(null);
    try {
      await sendMessage(text);
      scrollToEnd();
    } catch {
      setDraft(text); // restore on failure
      setSendError('Message failed to send. Please try again.');
    } finally {
      sendingRef.current = false;
    }
  }

  // Long-press another member's message to report or block them (Apple 1.2).
  // Own messages are skipped — you can't report yourself.
  function onMessageLongPress(message: ChatMessage): void {
    if (message.sender_id === currentUserId) return;
    Alert.alert(message.senderName, 'Keep Ridr safe for every family.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report message', onPress: () => void handleReport(message) },
      {
        text: `Block ${message.senderName}`,
        style: 'destructive',
        onPress: () => confirmBlock(message),
      },
    ]);
  }

  async function handleReport(message: ChatMessage): Promise<void> {
    const { ok, error: reportErr } = await reportUser({
      reportedUserId: message.sender_id,
      conversationId,
      messageId: message.id.startsWith('temp-') ? null : message.id,
      reason: 'reported_from_chat',
    });
    Alert.alert(
      ok ? 'Report received' : 'Could not report',
      ok
        ? "Thanks — we'll review this within 24 hours."
        : reportErr ?? 'Please try again.',
    );
  }

  function confirmBlock(message: ChatMessage): void {
    Alert.alert(
      `Block ${message.senderName}?`,
      "You'll stop seeing their messages. You can change this later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => void handleBlock(message),
        },
      ],
    );
  }

  async function handleBlock(message: ChatMessage): Promise<void> {
    const { ok, error: blockErr } = await blockUser(message.sender_id);
    if (!ok) {
      Alert.alert('Could not block', blockErr ?? 'Please try again.');
      return;
    }
    await refreshBlocks();
  }

  function renderItem({ item }: { item: DecoratedMessage }) {
    const { message, mine, showName, showTime, gapTop } = item;
    return (
      <View style={[styles.msgWrap, { marginTop: gapTop }]}>
        {showName ? (
          <Text style={styles.senderName}>{message.senderName}</Text>
        ) : null}
        <TouchableOpacity
          activeOpacity={mine ? 1 : 0.8}
          onLongPress={() => onMessageLongPress(message)}
          delayLongPress={350}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
        >
          <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
            {message.content}
          </Text>
        </TouchableOpacity>
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
            <ActivityIndicator color={colors.brandTeal} size="large" />
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
            ListFooterComponent={botTyping ? <TypingBubble /> : null}
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
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
              onPress={() => void handleSend()}
              disabled={!draft.trim()}
              accessibilityLabel="Send message"
            >
              <Ionicons name="arrow-up" size={20} color={colors.surfaceWhite} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWhite },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.ink,
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
  emptyText: { fontSize: 15, color: colors.textMuted, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: colors.textMuted },
  msgWrap: { maxWidth: '80%' },
  senderName: {
    fontSize: 11,
    color: colors.inkSecondary,
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  bubbleMine: {
    backgroundColor: colors.brandTeal,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceSubtle,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Matches a one-line bubble's height so the list does not jump when the
    // indicator is replaced by the reply.
    paddingVertical: 13,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  bubbleTextMine: { fontSize: 15, color: colors.surfaceWhite, lineHeight: 20 },
  bubbleTextTheirs: { fontSize: 15, color: colors.ink, lineHeight: 20 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  timeMine: { alignSelf: 'flex-end', marginRight: 4 },
  timeTheirs: { alignSelf: 'flex-start', marginLeft: 4 },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.surfaceWhite,
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
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
