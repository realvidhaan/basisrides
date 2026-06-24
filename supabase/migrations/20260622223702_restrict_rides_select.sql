-- Migration: 20260622223702_restrict_rides_select.sql
-- Severity: MEDIUM — Finding CONFIRMED-4 from security-audit/THREAT_MODEL.md
--
-- Verified against live pg_policies (2026-06): the `rides` table exists with
-- columns driver_id and rider_id, and its SELECT policy `rides_select_all` uses
-- USING (true) — any authenticated user can read EVERY ride. No client code
-- reads `rides` (the live carpool feature uses `trips`), so restricting it to
-- participants is safe. INSERT/UPDATE/DELETE are already restricted
-- (rides_insert_own / rides_update_own / rides_delete_rider), left untouched.

DROP POLICY IF EXISTS "rides_select_all" ON public.rides;
-- Idempotent: drop our own policy too so this migration can be re-applied.
DROP POLICY IF EXISTS "rides_select_participants" ON public.rides;

CREATE POLICY "rides_select_participants"
  ON public.rides
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = driver_id
    OR (select auth.uid()) = rider_id
  );

ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

COMMENT ON POLICY "rides_select_participants" ON public.rides
  IS 'Restrict rides SELECT to driver or rider only. Fixes CONFIRMED-4 (replaces rides_select_all).';
