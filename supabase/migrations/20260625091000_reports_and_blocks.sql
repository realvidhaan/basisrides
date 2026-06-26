-- Migration: 20260625091000_reports_and_blocks.sql
-- Apple App Store Guideline 1.2 (user-generated content): an app with
-- user-to-user messaging must let users REPORT objectionable content and BLOCK
-- abusive users. This adds the data layer for both; the client hides messages
-- from blocked users and exposes report/block actions in the chat UI.

-- ---------------------------------------------------------------------------
-- reports: a user flags another user (optionally a specific message). Only the
-- reporter and the service role (moderation) can read a report.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  conversation_id  uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  message_id       uuid REFERENCES public.messages (id) ON DELETE SET NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reports IS 'Abuse reports (Apple 1.2). Reviewed by the operator via service role.';

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reporter_id);

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own"
  ON public.reports FOR SELECT TO authenticated
  USING ((select auth.uid()) = reporter_id);

-- ---------------------------------------------------------------------------
-- blocks: blocker_id has blocked blocked_id. A user fully manages their OWN
-- block list and can see no one else's.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE public.blocks IS 'Per-user block list (Apple 1.2). Client hides blocked users'' messages.';

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON public.blocks;
CREATE POLICY "blocks_select_own"
  ON public.blocks FOR SELECT TO authenticated
  USING ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "blocks_insert_own" ON public.blocks;
CREATE POLICY "blocks_insert_own"
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "blocks_delete_own" ON public.blocks;
CREATE POLICY "blocks_delete_own"
  ON public.blocks FOR DELETE TO authenticated
  USING ((select auth.uid()) = blocker_id);
