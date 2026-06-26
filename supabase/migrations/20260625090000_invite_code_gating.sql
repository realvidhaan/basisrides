-- Migration: 20260625090000_invite_code_gating.sql
-- Severity: CRITICAL — Finding CONFIRMED-1 from security-audit/THREAT_MODEL.md
--
-- Closes the account-gating hole: previously ANY email could create an account
-- and immediately read every family's home address, child name, grade and plate.
-- This is a PARENT app (parents sign up with personal Gmail/Outlook addresses),
-- so an `@bisv.org` domain check would lock out real users. Instead we gate on
-- single-use INVITE CODES distributed through ParentSquare / a PTA champion —
-- only verified BISV families receive a code.
--
-- Enforcement is a BEFORE INSERT trigger on auth.users, kept SEPARATE from the
-- existing handle_new_user profile trigger so it cannot break profile creation.
-- Because both run in the same transaction, a raised exception here aborts the
-- whole signup — no orphaned auth user. The code is consumed (marked used) in
-- the same transaction, so a rollback frees it again.
--
-- The invite_code travels as signup metadata: SignupScreen passes it in the
-- createAccount `data` payload, the create-account Edge Function forwards it as
-- user_metadata, and it lands in auth.users.raw_user_meta_data->>'invite_code'.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invite_codes (
  code       text PRIMARY KEY,
  note       text,                          -- e.g. "Grade 7 ParentSquare batch, June 2026"
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz,
  used_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.invite_codes
  IS 'Single-use signup gate for verified BISV families (CONFIRMED-1). A row with used_at IS NULL is redeemable.';

-- Lock the table down: no client (anon or authenticated) may read or write it
-- directly. RLS with no policies = deny-all; access is only via the SECURITY
-- DEFINER functions below.
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Client UX pre-check: is this code currently redeemable?
-- Read-only, takes no action. Lets the signup form reject a bad code before the
-- user fills out the whole form. The hard security gate is the trigger below —
-- this is purely UX, so it is intentionally callable pre-auth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_invite_code(p_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invite_codes
    WHERE code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
      AND used_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.validate_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hard enforcement: BEFORE INSERT on auth.users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code     text;
  v_consumed text;
BEGIN
  -- Normalize: strip spaces/dashes, upper-case, so "abcd-1234" == "ABCD1234".
  v_code := upper(regexp_replace(
    coalesce(NEW.raw_user_meta_data->>'invite_code', ''), '[^A-Za-z0-9]', '', 'g'));

  IF v_code = '' THEN
    RAISE EXCEPTION 'INVITE_CODE_INVALID: an invite code is required to sign up'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Atomically claim the code: only an unused code matches, and the row lock on
  -- UPDATE serializes concurrent redemptions of the same code (single-use).
  UPDATE public.invite_codes
     SET used_at = now(), used_by = NEW.id
   WHERE code = v_code
     AND used_at IS NULL
  RETURNING code INTO v_consumed;

  IF v_consumed IS NULL THEN
    RAISE EXCEPTION 'INVITE_CODE_INVALID: invite code is invalid or already used'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invite_code_trigger ON auth.users;
CREATE TRIGGER enforce_invite_code_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invite_code();

-- ---------------------------------------------------------------------------
-- Admin helper: generate N single-use codes. Service-role only (run from the
-- Supabase SQL editor or a trusted server) — never callable from the app.
--   SELECT * FROM public.generate_invite_codes(20, 'Grade 7 ParentSquare batch');
-- Uses a no-ambiguous alphabet (no 0/O/1/I) so codes are easy to read/type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_invite_codes(p_count int, p_note text DEFAULT NULL)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_i        int;
  v_j        int;
BEGIN
  FOR v_i IN 1..greatest(p_count, 0) LOOP
    LOOP
      v_code := '';
      FOR v_j IN 1..8 LOOP
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      END LOOP;
      BEGIN
        INSERT INTO public.invite_codes (code, note) VALUES (v_code, p_note);
        EXIT;                                  -- inserted cleanly; emit it
      EXCEPTION WHEN unique_violation THEN
        -- astronomically rare collision; loop and try another code
      END;
    END LOOP;
    RETURN NEXT v_code;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_codes(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_invite_codes(int, text) TO service_role;
