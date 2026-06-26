import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';

/**
 * Abuse reporting + user blocking (Apple Guideline 1.2). Reports are reviewed by
 * the operator via the service role; blocks are managed per-user and the chat UI
 * hides messages from blocked senders.
 */

export interface ReportInput {
  reportedUserId: string;
  conversationId?: string | null;
  messageId?: string | null;
  reason?: string;
}

export async function reportUser(input: ReportInput): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const reporterId = auth.user?.id;
  if (!reporterId) return { ok: false, error: 'You must be signed in to report.' };

  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: input.reportedUserId,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    reason: input.reason ?? null,
  });
  if (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Could not submit your report. Please try again.' };
  }
  return { ok: true };
}

export async function blockUser(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const blockerId = auth.user?.id;
  if (!blockerId) return { ok: false, error: 'You must be signed in to block.' };

  // Idempotent: re-blocking an already-blocked user is a no-op, not an error.
  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Could not block this user. Please try again.' };
  }
  return { ok: true };
}

export async function unblockUser(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const blockerId = auth.user?.id;
  if (!blockerId) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Could not unblock this user. Please try again.' };
  }
  return { ok: true };
}

/** The set of user ids the signed-in user has blocked. */
export async function fetchBlockedIds(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from('blocks').select('blocked_id');
    if (error) throw error;
    return new Set((data ?? []).map((r) => (r as { blocked_id: string }).blocked_id));
  } catch (e) {
    Sentry.captureException(e);
    return new Set();
  }
}
