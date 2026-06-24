-- Migration: 20260622223702_restrict_rides_select.sql
-- Severity: MEDIUM
-- Finding: CONFIRMED-4 from security-audit/THREAT_MODEL.md
--
-- Problem:
--   The current rides SELECT policy allows ANY authenticated user to read ALL
--   rides rows. This exposes driver and rider identity, carpool dates, and
--   potentially route information to every member of the community, not just
--   participants in those rides.
--
-- Fix:
--   Restrict SELECT to rows where the authenticated user is the driver OR a
--   rider. Mirrors the trips table restriction pattern.
--
-- NOTE: This migration assumes the `rides` table has columns:
--   driver_id (uuid, FK to auth.users)
--   rider_id  (uuid, FK to auth.users)
-- Adjust column names if the actual schema differs. Verify with:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'rides';
--
-- APPLY TO: throwaway project first. Do NOT apply to production without schema verification.

DROP POLICY IF EXISTS "rides_select_all" ON public.rides;
DROP POLICY IF EXISTS "Allow authenticated users to select all rides" ON public.rides;
DROP POLICY IF EXISTS "rides select" ON public.rides;

-- Restrict SELECT to participants (driver or rider)
CREATE POLICY "rides_select_participants_only"
  ON public.rides
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = driver_id
    OR auth.uid() = rider_id
  );

ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

COMMENT ON POLICY "rides_select_participants_only" ON public.rides
  IS 'Restrict rides SELECT to driver or rider only. Fixes CONFIRMED-4 from 2026-06-22 security audit.';
