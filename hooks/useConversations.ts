import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Conversation, ConversationPreview, Message } from '@/types';

interface RawMyParticipantRow {
  conversation_id: string;
  last_read_at: string | null;
  conversation: Conversation | null;
}

interface RawParticipantRow {
  conversation_id: string;
  user: { id: string; full_name: string } | null;
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface UseConversationsResult {
  conversations: ConversationPreview[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Unique realtime topic per hook instance (matches the app's channel pattern).
let conversationsChannelSeq = 0;

function isAfter(a: string, b: string | null): boolean {
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

/**
 * Loads every conversation the current user belongs to, each decorated with its
 * other participants, last message, and unread count. Kept live by refetching
 * whenever a message is inserted or the user is added to a conversation.
 */
export function useConversations(): UseConversationsResult {
  const { user } = useCurrentUser();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;

  const fetchConversations = useCallback(async (): Promise<void> => {
    if (!uid) {
      setConversations([]);
      setLoading(false);
      return;
    }
    try {
      // 1. My memberships (+ the conversation rows + my last_read_at).
      const { data: mineData, error: mineErr } = await supabase
        .from('conversation_participants')
        .select(
          'conversation_id, last_read_at,' +
            ' conversation:conversations!conversation_participants_conversation_id_fkey(*)',
        )
        .eq('user_id', uid);

      if (mineErr) {
        setError('Could not load your messages. Please try again.');
        return;
      }

      const mine = (mineData ?? []) as unknown as RawMyParticipantRow[];
      const convIds = mine.map((r) => r.conversation_id);
      const lastReadById = new Map<string, string | null>();
      const convById = new Map<string, Conversation>();
      for (const row of mine) {
        lastReadById.set(row.conversation_id, row.last_read_at);
        if (row.conversation) convById.set(row.conversation_id, row.conversation);
      }

      if (convIds.length === 0) {
        setConversations([]);
        setError(null);
        return;
      }

      // 2. All participants of those conversations, and 3. all their messages.
      const [partRes, msgRes] = await Promise.all([
        supabase
          .from('conversation_participants')
          .select(
            'conversation_id,' +
              ' user:users!conversation_participants_user_id_fkey(id, full_name)',
          )
          .in('conversation_id', convIds),
        supabase
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false }),
      ]);

      if (partRes.error || msgRes.error) {
        setError('Could not load your messages. Please try again.');
        return;
      }

      const partRows = (partRes.data ?? []) as unknown as RawParticipantRow[];
      const participantsById = new Map<string, { id: string; name: string }[]>();
      for (const row of partRows) {
        if (!row.user) continue;
        const list = participantsById.get(row.conversation_id) ?? [];
        list.push({ id: row.user.id, name: row.user.full_name });
        participantsById.set(row.conversation_id, list);
      }

      const msgRows = (msgRes.data ?? []) as unknown as RawMessageRow[];
      const lastMessageById = new Map<string, Message>();
      const unreadById = new Map<string, number>();
      for (const m of msgRows) {
        // Rows are newest-first, so the first seen per conversation is the last.
        if (!lastMessageById.has(m.conversation_id)) {
          lastMessageById.set(m.conversation_id, m);
        }
        const lastRead = lastReadById.get(m.conversation_id) ?? null;
        if (m.sender_id !== uid && isAfter(m.created_at, lastRead)) {
          unreadById.set(
            m.conversation_id,
            (unreadById.get(m.conversation_id) ?? 0) + 1,
          );
        }
      }

      const previews: ConversationPreview[] = convIds
        .map((id) => {
          const conversation = convById.get(id);
          if (!conversation) return null;
          return {
            conversation,
            participants: participantsById.get(id) ?? [],
            lastMessage: lastMessageById.get(id) ?? null,
            unreadCount: unreadById.get(id) ?? 0,
          } satisfies ConversationPreview;
        })
        .filter((p): p is ConversationPreview => p !== null);

      previews.sort((a, b) => {
        const at = a.lastMessage?.created_at ?? a.conversation.created_at;
        const bt = b.lastMessage?.created_at ?? b.conversation.created_at;
        return new Date(bt).getTime() - new Date(at).getTime();
      });

      setConversations(previews);
      setError(null);
    } catch {
      setError('Could not load your messages. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void fetchConversations();

    conversationsChannelSeq += 1;
    const channel = supabase
      .channel(`conversations-${conversationsChannelSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => void fetchConversations(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants' },
        () => void fetchConversations(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  return { conversations, loading, error, refetch: fetchConversations };
}
