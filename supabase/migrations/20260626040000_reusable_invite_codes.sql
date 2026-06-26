-- Migration: 20260626040000_reusable_invite_codes.sql
--
-- Switch the signup gate from SINGLE-USE codes to REUSABLE codes. A code is now
-- valid as long as it is `active`, and any number of families can sign up with
-- it. If a code leaks, rotate it: deactivate it and mint a new one. This matches
-- how the code is actually distributed (one post in ParentSquare), where a
-- single-use code would lock out everyone after the first signup.

-- Reusable model: drop per-signup consumption, add an active flag.
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.invite_codes DROP COLUMN IF EXISTS used_at;
ALTER TABLE public.invite_codes DROP COLUMN IF EXISTS used_by;

-- The previously generated single-use codes belong to the old model — retire
-- them so only the new reusable code (created right after this migration) works.
UPDATE public.invite_codes SET active = false;

COMMENT ON TABLE public.invite_codes
  IS 'Reusable signup gate (CONFIRMED-1). A row with active=true is redeemable any number of times. Rotate via set_invite_code / rotate_invite_code.';

-- Validate (UX pre-check): code exists and is active. No consumption.
CREATE OR REPLACE FUNCTION public.validate_invite_code(p_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invite_codes
    WHERE code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
      AND active
  );
$$;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;

-- Hard gate (BEFORE INSERT on auth.users): require an active code. No consume.
CREATE OR REPLACE FUNCTION public.enforce_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := upper(regexp_replace(
    coalesce(NEW.raw_user_meta_data->>'invite_code', ''), '[^A-Za-z0-9]', '', 'g'));

  IF v_code = '' THEN
    RAISE EXCEPTION 'INVITE_CODE_INVALID: an invite code is required to sign up'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invite_codes WHERE code = v_code AND active
  ) THEN
    RAISE EXCEPTION 'INVITE_CODE_INVALID: invite code is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_invite_code() FROM PUBLIC, anon, authenticated;

-- Admin: set THE active code to a chosen (memorable) value — deactivates all
-- others so exactly one code is live. Returns the normalized code.
--   SELECT public.set_invite_code('BISVFALL2026', 'ParentSquare post');
CREATE OR REPLACE FUNCTION public.set_invite_code(p_code text, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_code) < 4 THEN
    RAISE EXCEPTION 'Invite code must be at least 4 letters/numbers';
  END IF;
  UPDATE public.invite_codes SET active = false WHERE active;
  INSERT INTO public.invite_codes (code, note, active)
    VALUES (v_code, p_note, true)
    ON CONFLICT (code) DO UPDATE SET active = true, note = COALESCE(EXCLUDED.note, public.invite_codes.note);
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.set_invite_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_invite_code(text, text) TO service_role;

-- Admin: rotate to a fresh RANDOM reusable code (deactivate all, mint one new).
-- Use this the moment a code leaks. Returns the new code.
--   SELECT public.rotate_invite_code('rotated after leak');
CREATE OR REPLACE FUNCTION public.rotate_invite_code(p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_j        int;
BEGIN
  UPDATE public.invite_codes SET active = false WHERE active;
  LOOP
    v_code := '';
    FOR v_j IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.invite_codes (code, note, active) VALUES (v_code, p_note, true);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- code already existed; reactivate it and use it
      UPDATE public.invite_codes SET active = true, note = p_note WHERE code = v_code;
      RETURN v_code;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_invite_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_invite_code(text) TO service_role;
