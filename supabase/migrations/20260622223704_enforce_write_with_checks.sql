-- Migration: 20260622223704_enforce_write_with_checks.sql
-- Severity: MEDIUM
-- Findings: Multiple tables may be missing with_check on INSERT/UPDATE
--   (availability, schedule_skips, swaps, invites, trips, trip_pickups)
--
-- Problem:
--   Without explicit with_check expressions, a user could potentially INSERT
--   rows with a foreign user_id or requester_id (identity spoofing). The client
--   always passes the correct uid, but server-side enforcement is required.
--
-- This migration reinforces with_check on all write policies for these tables.
--
-- IMPORTANT: Verify existing policy names before applying.
--   Run: SELECT policyname, cmd, qual, with_check FROM pg_policies
--        WHERE schemaname = 'public' ORDER BY tablename, cmd;
--
-- Adjust policy names to match what's actually in your project.

-- ========================
-- availability
-- ========================
DROP POLICY IF EXISTS "availability_insert" ON public.availability;
DROP POLICY IF EXISTS "availability_update" ON public.availability;
DROP POLICY IF EXISTS "Allow users to insert own availability" ON public.availability;
DROP POLICY IF EXISTS "Allow users to update own availability" ON public.availability;

CREATE POLICY "availability_insert_own"
  ON public.availability
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "availability_update_own"
  ON public.availability
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "availability_delete_own"
  ON public.availability
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ========================
-- schedule_skips
-- ========================
DROP POLICY IF EXISTS "schedule_skips_insert" ON public.schedule_skips;
DROP POLICY IF EXISTS "schedule_skips_delete" ON public.schedule_skips;
DROP POLICY IF EXISTS "Allow users to insert own skips" ON public.schedule_skips;
DROP POLICY IF EXISTS "Allow users to delete own skips" ON public.schedule_skips;

CREATE POLICY "schedule_skips_insert_own"
  ON public.schedule_skips
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "schedule_skips_delete_own"
  ON public.schedule_skips
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ========================
-- swaps
-- ========================
DROP POLICY IF EXISTS "swaps_insert" ON public.swaps;
DROP POLICY IF EXISTS "swaps_update" ON public.swaps;
DROP POLICY IF EXISTS "Allow users to insert own swaps" ON public.swaps;
DROP POLICY IF EXISTS "Allow users to update own swaps" ON public.swaps;

CREATE POLICY "swaps_insert_own"
  ON public.swaps
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "swaps_update_own"
  ON public.swaps
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id)
  WITH CHECK (auth.uid() = requester_id);

-- ========================
-- invites
-- ========================
DROP POLICY IF EXISTS "invites_insert" ON public.invites;
DROP POLICY IF EXISTS "Allow users to insert own invites" ON public.invites;

CREATE POLICY "invites_insert_own"
  ON public.invites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = inviter_id);

-- ========================
-- trips — driver-only writes
-- ========================
DROP POLICY IF EXISTS "trips_insert" ON public.trips;
DROP POLICY IF EXISTS "trips_update" ON public.trips;
DROP POLICY IF EXISTS "Allow driver to insert trips" ON public.trips;
DROP POLICY IF EXISTS "Allow driver to update trips" ON public.trips;

CREATE POLICY "trips_insert_driver_only"
  ON public.trips
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "trips_update_driver_only"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- ========================
-- trip_pickups — driver of the parent trip only
-- ========================
DROP POLICY IF EXISTS "trip_pickups_insert" ON public.trip_pickups;
DROP POLICY IF EXISTS "trip_pickups_delete" ON public.trip_pickups;
DROP POLICY IF EXISTS "Allow driver to insert pickups" ON public.trip_pickups;
DROP POLICY IF EXISTS "Allow driver to delete pickups" ON public.trip_pickups;

CREATE POLICY "trip_pickups_insert_driver_only"
  ON public.trip_pickups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (
      SELECT driver_id FROM public.trips WHERE id = trip_id LIMIT 1
    )
  );

CREATE POLICY "trip_pickups_delete_driver_only"
  ON public.trip_pickups
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = (
      SELECT driver_id FROM public.trips WHERE id = trip_id LIMIT 1
    )
  );

-- ========================
-- hardship_passes — own writes
-- ========================
DROP POLICY IF EXISTS "hardship_passes_insert" ON public.hardship_passes;
DROP POLICY IF EXISTS "hardship_passes_delete" ON public.hardship_passes;

CREATE POLICY "hardship_passes_insert_own"
  ON public.hardship_passes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "hardship_passes_delete_own"
  ON public.hardship_passes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
