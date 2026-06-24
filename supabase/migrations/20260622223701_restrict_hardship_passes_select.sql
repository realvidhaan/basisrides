-- Migration: 20260622223701_restrict_hardship_passes_select.sql
-- Severity: MEDIUM
-- Finding: CONFIRMED-3 from security-audit/THREAT_MODEL.md
--
-- Problem:
--   The current hardship_passes SELECT policy allows ANY authenticated user to
--   read ALL rows. This exposes which families have hardship exemptions to every
--   member of the carpool community — sensitive personal information.
--   No client code in the current repo reads this table (it appears legacy or
--   planned), making the policy an unmitigated passive leak.
--
-- Fix:
--   Replace the permissive SELECT policy with one that restricts reads to
--   own rows only (auth.uid() = user_id).
--
-- APPLY TO: throwaway project first, verify, then production.
-- DO NOT apply with apply_migration to production without testing.

-- Drop the existing permissive SELECT policy (name may differ; adjust if needed)
DROP POLICY IF EXISTS "hardship_passes_select_all" ON public.hardship_passes;
DROP POLICY IF EXISTS "Allow authenticated users to select all hardship passes" ON public.hardship_passes;
DROP POLICY IF EXISTS "hardship_passes select" ON public.hardship_passes;

-- Create a restrictive SELECT policy: only own rows
CREATE POLICY "hardship_passes_select_own"
  ON public.hardship_passes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure RLS is enabled (should already be, but be explicit)
ALTER TABLE public.hardship_passes ENABLE ROW LEVEL SECURITY;

COMMENT ON POLICY "hardship_passes_select_own" ON public.hardship_passes
  IS 'Restrict hardship pass SELECT to own rows only. Fixes CONFIRMED-3 from 2026-06-22 security audit.';
