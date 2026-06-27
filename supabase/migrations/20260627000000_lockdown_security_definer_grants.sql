-- Lock down SECURITY DEFINER functions that PostgREST exposes at /rest/v1/rpc/.
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default, and Supabase
-- additionally grants anon+authenticated, so these were callable by anyone —
-- including signed-out (anon) callers — over the public REST API. Flagged by the
-- security advisor (lints 0028/0029). As established in the invite-code migrations,
-- `REVOKE ... FROM PUBLIC` alone does NOT remove the explicit anon/authenticated
-- grants, so we revoke by role name, then re-grant only the roles each function
-- actually needs.

-- Group 1 — internal TRIGGER functions. They are never meant to be called via the
-- API. Triggers fire under the table owner's context and do NOT check the invoking
-- role's EXECUTE privilege, so removing all app-role EXECUTE has no effect on
-- trigger behaviour — it only closes the /rpc/ endpoint.
REVOKE EXECUTE ON FUNCTION public.notify_on_message()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_pickup()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_trip()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_hardship_limit() FROM PUBLIC, anon, authenticated;

-- Group 2 — action RPCs the CLIENT legitimately calls as a SIGNED-IN user
-- (confirmed via rpc('...') call sites in hooks/). Keep `authenticated`; remove
-- only anonymous (signed-out) access. Revoke PUBLIC too, since the default PUBLIC
-- grant is what lets anon in even without an explicit anon grant.
REVOKE EXECUTE ON FUNCTION public.accept_swap(uuid)                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_swap(uuid)                        TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_or_create_dm(uuid)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_or_create_dm(uuid)                   TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_or_create_group(date, uuid[], text)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_or_create_group(date, uuid[], text)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.register_push_token(text, text)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_push_token(text, text)          TO authenticated;

-- Intentionally UNCHANGED:
--   * validate_invite_code(text), email_exists(text) — kept anon-callable for the
--     signup UX. email_exists is a known, accepted account-enumeration tradeoff.
--   * is_conversation_participant(uuid, uuid) — used INSIDE the messages RLS
--     policy, so `authenticated` must keep EXECUTE or messaging breaks. Closing
--     its /rpc/ exposure requires moving it to a private schema; deferred to its
--     own carefully-tested migration to avoid breaking RLS in this v1 pass.
