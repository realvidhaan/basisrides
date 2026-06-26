import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { fetchBlockedIds } from '@/lib/moderation';
import type { Message } from '@/types';

export type ChatMessage = Message & { senderName: string };

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender: { full_name: string } | null;
}

interface UseMessagesResult {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  /** Re-pull the caller's block list and re-filter (call after blocking). */
  refreshBlocks: () => Promise<void>;
}

// Unique realtime topic per hook instance (matches the app's channel pattern).
let messagesChannelSeq = 0;
// Monotonic counter for optimistic temp ids (never collides with real UUIDs).
let tempSeq = 0;

/** Chronological (oldest-first) merge by id; replaces an existing row in place. */
function upsertMessage(prev: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const idx = prev.findIndex((m) => m.id === msg.id);
  let next: ChatMessage[];
  if (idx >= 0) {
    next = [...prev];
    next[idx] = msg;
  } else {
    next = [...prev, msg];
  }
  next.sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
  return next;
}

/**
 * Loads a conversation's messages (with sender names), keeps them live via a
 * realtime subscription filtered to this conversation, and sends new messages
 * optimistically (appended instantly, reverted on failure).
 */
export function useMessages(conversationId: string): UseMessagesResult {
  const { user } = useCurrentUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Block list: messages from blocked senders are filtered out of the returned
  // list (Apple 1.2). Held in a ref + version counter so updates recompute the
  // memoized output without re-running the load effect.
  const blockedRef = useRef<Set<string>>(new Set());
  const [blockedVersion, setBlockedVersion] = useState(0);

  const refreshBlocks = useCallback(async (): Promise<void> => {
    blockedRef.current = await fetchBlockedIds();
    setBlockedVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    void refreshBlocks();
  }, [refreshBlocks]);

  // Cache of userId -> display name so realtime inserts can be labelled without
  // a join. Seeded from the initial load and topped up on demand.
  const nameCache = useRef<Map<string, string>>(new Map());

  const resolveName = useCallback(async (userId: string): Promise<string> => {
    const cached = nameCache.current.get(userId);
    if (cached) return cached;
    try {
      const { data } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .single();
      const name = (data as { full_name: string } | null)?.full_name ?? 'Member';
      nameCache.current.set(userId, name);
      return name;
    } catch {
      return 'Member';
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      try {
        const { data, error: loadErr } = await supabase
          .from('messages')
          .select(
            'id, conversation_id, sender_id, content, created_at,' +
              ' sender:users!messages_sender_id_fkey(full_name)',
          )
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (!active) return;
        if (loadErr) {
          setError('Could not load this conversation. Please try again.');
          return;
        }

        const rows = (data ?? []) as unknown as RawMessageRow[];
        const mapped: ChatMessage[] = rows.map((r) => {
          const name = r.sender?.full_name ?? 'Member';
          nameCache.current.set(r.sender_id, name);
          return {
            id: r.id,
            conversation_id: r.conversation_id,
            sender_id: r.sender_id,
            content: r.content,
            created_at: r.created_at,
            senderName: name,
          };
        });
        setMessages(mapped);
        setError(null);
      } catch {
        if (active) {
          setError('Could not load this conversation. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    messagesChannelSeq += 1;
    const channel = supabase
      .channel(`messages-${conversationId}-${messagesChannelSeq}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          void (async () => {
            const senderName = await resolveName(row.sender_id);
            if (!active) return;
            setMessages((prev) => upsertMessage(prev, { ...row, senderName }));
          })();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, resolveName]);

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      const trimmed = content.trim();
      if (!trimmed || !user) return;

      const myName = user.full_name;
      nameCache.current.set(user.id, myName);

      tempSeq += 1;
      const tempId = `temp-${tempSeq}`;
      const optimistic: ChatMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmed,
        created_at: new Date().toISOString(),
        senderName: myName,
      };
      setMessages((prev) => upsertMessage(prev, optimistic));
      setError(null);

      try {
        const { data, error: insErr } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: trimmed,
          })
          .select('id, conversation_id, sender_id, content, created_at')
          .single();

        if (insErr || !data) {
          Sentry.captureException(insErr);
          throw new Error('send failed');
        }

        const real = data as Message;
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          return upsertMessage(withoutTemp, { ...real, senderName: myName });
        });
      } catch (e) {
        Sentry.captureException(e);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw new Error('Message failed to send. Please try again.');
      }
    },
    [conversationId, user],
  );

  // Hide messages from blocked senders. Covers both the initial load and
  // realtime inserts (a blocked user's incoming message is filtered on render).
  const visibleMessages = useMemo(
    () => messages.filter((m) => !blockedRef.current.has(m.sender_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blockedVersion gates the recompute
    [messages, blockedVersion],
  );

  return useMemo(
    () => ({ messages: visibleMessages, loading, error, sendMessage, refreshBlocks }),
    [visibleMessages, loading, error, sendMessage, refreshBlocks],
  );
}
