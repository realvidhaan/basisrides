-- Blocking was stored (public.blocks) with correct RLS, but nothing on the
-- server read it: msg_insert only checked conversation membership, so a blocked
-- user could still INSERT messages that arrived via realtime. The client-side
-- filter in useMessages only hid them in the blocker's own UI.
--
-- This adds a SECURITY DEFINER helper that reports whether a block exists in
-- EITHER direction between the actor and any other participant of a
-- conversation, and wires it into msg_insert. Once A and B have a block between
-- them, neither can send into a shared conversation (the thread is frozen),
-- which is the correct mutual semantic for a safety feature.

create or replace function public.is_blocked_in_conversation(conv_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.conversation_participants cp
    join public.blocks b
      on (b.blocker_id = uid          and b.blocked_id = cp.user_id)
      or (b.blocker_id = cp.user_id   and b.blocked_id = uid)
    where cp.conversation_id = conv_id
      and cp.user_id <> uid
  );
$function$;

-- Mirror the locked-down posture: only authenticated callers (RLS evaluation),
-- never anon/public directly.
revoke all on function public.is_blocked_in_conversation(uuid, uuid) from public;
revoke all on function public.is_blocked_in_conversation(uuid, uuid) from anon;
grant execute on function public.is_blocked_in_conversation(uuid, uuid) to authenticated;

-- Re-create msg_insert with the existing membership check plus the block gate.
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages
  for insert
  with check (
    (select auth.uid()) = sender_id
    and is_conversation_participant(conversation_id, (select auth.uid()))
    and not is_blocked_in_conversation(conversation_id, (select auth.uid()))
  );
