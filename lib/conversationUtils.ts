import { supabase } from '@/lib/supabase';
import { parseISO, formatMonthDay } from '@/lib/dateUtils';

/**
 * Get-or-create helpers for conversations.
 *
 * Both call SECURITY DEFINER RPCs (`get_or_create_dm`, `get_or_create_group`)
 * rather than inserting rows directly. The `cp_insert` RLS policy only allows a
 * client to insert its OWN participant row, so a client cannot add the other DM
 * partner or the rest of a group. The RPCs do the existence check + all inserts
 * server-side in one atomic call (so concurrent taps can't create duplicate
 * DMs), and they derive the caller's identity from `auth.uid()` — never trusting
 * an id passed from the client.
 */

/**
 * Returns the id of the 1:1 DM between the current user and `otherUserId`,
 * creating it (with both participants) if it doesn't exist yet.
 */
export async function getOrCreateDM(
  currentUserId: string,
  otherUserId: string,
): Promise<string> {
  try {
    if (currentUserId === otherUserId) {
      throw new Error('Cannot start a conversation with yourself.');
    }
    const { data, error } = await supabase.rpc('get_or_create_dm', {
      other_user_id: otherUserId,
    });
    if (error || typeof data !== 'string') {
      throw new Error('Could not open this conversation. Please try again.');
    }
    return data;
  } catch {
    throw new Error('Could not open this conversation. Please try again.');
  }
}

/**
 * Returns the id of the group chat for `rideDate`, creating it if needed and
 * idempotently adding any participants that aren't already in it.
 */
export async function getOrCreateGroupChat(
  rideDate: string,
  participantIds: string[],
): Promise<string> {
  try {
    const title = `Carpool · ${formatMonthDay(parseISO(rideDate))}`;
    const { data, error } = await supabase.rpc('get_or_create_group', {
      p_ride_date: rideDate,
      p_participant_ids: participantIds,
      p_title: title,
    });
    if (error || typeof data !== 'string') {
      throw new Error('Could not open the group chat. Please try again.');
    }
    return data;
  } catch {
    throw new Error('Could not open the group chat. Please try again.');
  }
}
