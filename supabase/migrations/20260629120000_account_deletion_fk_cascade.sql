-- Account deletion (Apple 5.1.1(v)) relies on auth.admin.deleteUser cascading
-- through every user-linked table. Three FKs were left as NO ACTION, which
-- BLOCKS deletion entirely for any user referenced by a ride or an outgoing
-- swap (a live failure: real users are referenced by swaps.requester_id). Flip
-- them to ON DELETE CASCADE so deleting the auth user purges these rows too.
--
-- swaps.accepted_by is intentionally left as SET NULL: the swap row itself is
-- the requester's record; when the *accepter* deletes their account we strip
-- their identity from the swap (their data is purged) but keep the requester's
-- row rather than deleting someone else's data out from under them.

alter table public.rides drop constraint rides_rider_id_fkey,
  add constraint rides_rider_id_fkey
    foreign key (rider_id) references public.users(id) on delete cascade;

alter table public.rides drop constraint rides_driver_id_fkey,
  add constraint rides_driver_id_fkey
    foreign key (driver_id) references public.users(id) on delete cascade;

alter table public.swaps drop constraint swaps_requester_id_fkey,
  add constraint swaps_requester_id_fkey
    foreign key (requester_id) references public.users(id) on delete cascade;
