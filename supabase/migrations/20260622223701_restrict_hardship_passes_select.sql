-- Migration: 20260622223701_restrict_hardship_passes_select.sql
-- Severity: MEDIUM — Finding CONFIRMED-3 from security-audit/THREAT_MODEL.md
--
-- Verified against live pg_policies (2026-06): the leaky policy is named
-- `hp_select_all` with USING (true) — any authenticated user can read EVERY row,
-- exposing which families hold hardship exemptions (sensitive). Replace it with
-- an own-rows-only SELECT policy. INSERT/DELETE are already owner-restricted by
-- hp_insert_own / hp_delete_own (the latter is left untouched here).

-- Remove the permissive SELECT policy (real name, from pg_policies).
DROP POLICY IF EXISTS "hp_select_all" ON public.hardship_passes;
-- Idempotent: drop our own policy too so this migration can be re-applied.
DROP POLICY IF EXISTS "hp_select_own" ON public.hardship_passes;

CREATE POLICY "hp_select_own"
  ON public.hardship_passes
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

ALTER TABLE public.hardship_passes ENABLE ROW LEVEL SECURITY;

COMMENT ON POLICY "hp_select_own" ON public.hardship_passes
  IS 'Restrict hardship pass SELECT to own rows only. Fixes CONFIRMED-3 (replaces hp_select_all).';
