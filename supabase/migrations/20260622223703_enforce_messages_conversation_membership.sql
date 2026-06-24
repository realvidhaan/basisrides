-- Migration: 20260622223703_enforce_messages_conversation_membership.sql
-- Severity: HIGH — Finding CONFIRMED-5 from security-audit/THREAT_MODEL.md
--
-- Verified against live pg_policies (2026-06):
--   * messages SELECT (`msg_select`) ALREADY enforces membership via
--     is_conversation_participant(conversation_id, (select auth.uid())) — left as-is.
--   * messages INSERT (`msg_insert`) is recreated here so its WITH CHECK requires
--     BOTH that the row's sender is the caller AND that the caller is a participant
--     of the target conversation, closing the cross-conversation injection hole.
--
-- The membership helper is the EXISTING two-argument function
-- public.is_conversation_participant(conversation_id uuid, user_id uuid). This
-- migration does NOT (re)define it — the live SELECT policies already depend on
-- that exact signature.

DROP POLICY IF EXISTS "msg_insert" ON public.messages;

CREATE POLICY "msg_insert"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = sender_id
    AND is_conversation_participant(conversation_id, (select auth.uid()))
  );

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

COMMENT ON POLICY "msg_insert" ON public.messages
  IS 'Require sender_id = auth.uid() AND conversation membership on INSERT. Fixes CONFIRMED-5.';
