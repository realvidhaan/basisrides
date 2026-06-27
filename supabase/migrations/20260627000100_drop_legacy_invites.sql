-- Remove the legacy invites feature.
--
-- The `invites` table and `redeem_invite(text)` RPC are leftovers from a removed
-- feature; account gating is now handled entirely by `invite_codes` +
-- `validate_invite_code`. A prior refactor commit explicitly deferred dropping
-- these ("not in this repo; drop in a follow-up migration"), and a repo-wide grep
-- confirms ZERO references in client or edge-function code.
--
-- The security advisor flagged redeem_invite as anon-executable; dropping it
-- removes that surface entirely. Dropping the table also clears its old RLS
-- policies and two unindexed-foreign-key performance warnings.

-- Drop the RPC first (its body references the table; harmless either order, but
-- this keeps intent clear). IF EXISTS makes the migration idempotent.
DROP FUNCTION IF EXISTS public.redeem_invite(text);

-- Dropping the table also drops its policies, indexes, and constraints.
DROP TABLE IF EXISTS public.invites;
