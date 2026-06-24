-- Migration: 20260622223703_enforce_messages_conversation_membership.sql
-- Severity: HIGH (if gap exists — needs verification)
-- Finding: CONFIRMED-5 from security-audit/THREAT_MODEL.md
--
-- Problem:
--   The messages INSERT policy must verify BOTH:
--     1. auth.uid() = sender_id (prevent impersonation)
--     2. is_conversation_participant(conversation_id) (prevent injection into foreign conversations)
--
--   If the with_check only verifies (1) and not (2), any authenticated user who
--   knows or guesses a conversation UUID can inject messages into conversations
--   they are not part of.
--
-- Fix:
--   Drop and recreate the messages INSERT policy with both conditions in with_check.
--
-- PREREQUISITE: The function is_conversation_participant(uuid) must exist. It should:
--   RETURNS boolean AS $$
--     SELECT EXISTS (
--       SELECT 1 FROM conversation_participants
--       WHERE conversation_id = $1 AND user_id = auth.uid()
--     );
--   $$ LANGUAGE sql STABLE SECURITY DEFINER;
--
-- VERIFY current policy first:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'messages' AND cmd = 'INSERT';
--
-- Only apply this migration if the with_check does NOT already include
-- is_conversation_participant(conversation_id).

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "Allow participants to insert messages" ON public.messages;
DROP POLICY IF EXISTS "messages insert" ON public.messages;

CREATE POLICY "messages_insert_participant_only"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_conversation_participant(conversation_id)
  );

-- Also ensure the SELECT policy is correct (only participants can read)
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "Allow participants to select messages" ON public.messages;
DROP POLICY IF EXISTS "messages select" ON public.messages;

CREATE POLICY "messages_select_participant_only"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (is_conversation_participant(conversation_id));

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

COMMENT ON POLICY "messages_insert_participant_only" ON public.messages
  IS 'Require sender_id = auth.uid() AND conversation membership on INSERT. Fixes CONFIRMED-5 from 2026-06-22 security audit.';
