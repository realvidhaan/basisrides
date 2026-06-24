-- Migration: 20260622223704_enforce_write_with_checks.sql
-- Severity: MEDIUM
--
-- Verified against live pg_policies (2026-06). Reinforces server-side ownership
-- on the INSERT-only write policies so a client cannot insert a row with a
-- foreign owner id (identity spoofing), regardless of the current WITH CHECK.
-- Each policy is dropped by its REAL name and recreated, so the migration is
-- idempotent and never adds a duplicate.
--
-- INTENTIONALLY NOT TOUCHED:
--   * availability (`avail_all_own`) and swaps (`swaps_all_own`) are FOR ALL
--     policies; an omitted WITH CHECK defaults to the USING expression
--     (auth.uid() = owner), so their writes are already owner-checked.
--   * UPDATE/DELETE policies already correct: trips_update_own, hp_delete_own,
--     skips_delete_own, rides_update_own/rides_delete_rider, tp_delete_driver,
--     notif_update_own, users_update_own, cp_update_own.
--   * Community-visible SELECT policies (users_select_all, avail_select_all,
--     skips_select_all, swaps_select_all) are intentional — the carpool rotation
--     reads every member's schedule — and are left in place.

-- schedule_skips: only the row's owner may insert.
DROP POLICY IF EXISTS "skips_insert_own" ON public.schedule_skips;
CREATE POLICY "skips_insert_own"
  ON public.schedule_skips
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- invites: only the inviter may create their invite.
DROP POLICY IF EXISTS "invites_insert_own" ON public.invites;
CREATE POLICY "invites_insert_own"
  ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = inviter_id);

-- trips: only the driver may create their trip (covers the live-trip upsert,
-- whose INSERT branch is gated here and UPDATE branch by trips_update_own).
DROP POLICY IF EXISTS "trips_insert_own" ON public.trips;
CREATE POLICY "trips_insert_own"
  ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = driver_id);

-- hardship_passes: only the row's owner may insert.
DROP POLICY IF EXISTS "hp_insert_own" ON public.hardship_passes;
CREATE POLICY "hp_insert_own"
  ON public.hardship_passes
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- trip_pickups: only the driver of the parent trip may record a pickup.
-- Mirrors the existing tp_delete_driver EXISTS-form (evaluated under the
-- driver's own visibility of trips, which trips_select grants).
DROP POLICY IF EXISTS "tp_insert_driver" ON public.trip_pickups;
CREATE POLICY "tp_insert_driver"
  ON public.trip_pickups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_pickups.trip_id
        AND t.driver_id = (select auth.uid())
    )
  );
