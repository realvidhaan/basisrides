-- Carpool pairing (lib/pairing.ts) is computed identically on every client over
-- shared community data. For two blocked people to CONSISTENTLY never share a
-- car, the block must be visible to that shared computation — a block only the
-- blocker's client knew about would make the two screens disagree.
--
-- This exposes block pairs to authenticated users so the engine can keep them
-- apart. It deliberately leaks ONLY the existence of a block between two users,
-- canonicalized (least/greatest) so neither the direction (who blocked whom) nor
-- the reason is revealed. Not callable by anon.

create or replace function public.community_blocked_pairs()
returns table (user_a uuid, user_b uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct
    least(blocker_id, blocked_id)    as user_a,
    greatest(blocker_id, blocked_id) as user_b
  from public.blocks;
$function$;

revoke all on function public.community_blocked_pairs() from public;
revoke all on function public.community_blocked_pairs() from anon;
grant execute on function public.community_blocked_pairs() to authenticated;
