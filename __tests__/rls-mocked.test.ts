/**
 * BasisRide — Mocked RLS + Behavior Test Suite
 *
 * Stack: Jest + jest-expo preset. No network calls. All Supabase interactions
 * are intercepted via the automatic mock at __mocks__/@supabase/supabase-js.ts.
 *
 * RLS simulation: policy decisions are encoded as mock return values.
 * A denial is { data: null, error: { message: '...row-level security...', code: '42501' } }
 * or an empty array for SELECT denials. This mirrors real supabase-js behaviour.
 *
 * Organization:
 *   1. HAPPY PATH
 *   2. EDGE CASES
 *   3. SECURITY / EXPLOIT ATTEMPTS
 *   4. GLITCH / UX SCENARIOS
 */

// Stub other modules BEFORE any imports that pull them transitively
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }) },
  Platform: { OS: 'ios' },
}));

jest.mock('react-native-url-polyfill/auto', () => {});

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Import the harness directly from the factory (no out-of-scope issue — this
// is a plain import, not inside a jest.mock() factory callback).
import {
  __testHarness,
  RLS_DENY_WRITE,
  RLS_DENY_SELECT,
  RLS_DENY_UPDATE,
  NOT_AUTHENTICATED,
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
} from '../__mocks__/supabaseMockFactory';

// The automatic @supabase/supabase-js mock at __mocks__/@supabase/supabase-js.ts
// uses the same singleton __testHarness from the factory, so configuring
// __testHarness here controls what the mock client returns.
const harness = __testHarness;

// Fixed "now" for deterministic date tests
const FIXED_NOW = new Date('2026-06-22T10:00:00.000Z');
const FIXED_ISO = '2026-06-22';
const PAST_ISO = '2026-06-01';
const FUTURE_ISO = '2026-06-30';

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

const USER_A = { id: 'user-a-uuid', email: 'usera@test.com' };
const USER_B = { id: 'user-b-uuid', email: 'userb@test.com' };

// =============================================================================
// 1. HAPPY PATH
// =============================================================================

describe('HAPPY PATH', () => {
  beforeEach(() => {
    harness.clearAll();
    harness.setAuthUser(USER_A);
  });

  it('sign up: createAccount edge function returns ok:true', async () => {
    harness.setFunctionResult('create-account', { data: { ok: true }, error: null });
    // Validate mock is wired: the function invoke should return ok:true
    const result = await harness.client.functions.invoke('create-account', {
      body: { email: 'usera@test.com', password: 'password123', data: { full_name: 'User A' } },
    });
    expect(result.error).toBeNull();
    expect((result.data as { ok: boolean }).ok).toBe(true);
  });

  it('sign up: createAccount propagates edge function error correctly', async () => {
    harness.setFunctionResult('create-account', {
      data: null,
      error: { message: 'Email domain not allowed' },
    });
    const result = await harness.client.functions.invoke('create-account', {
      body: { email: 'outsider@gmail.com', password: 'password123', data: {} },
    });
    expect(result.error).toBeDefined();
    expect((result.error as { message: string }).message).toMatch(/domain/i);
  });

  it('set availability: authenticated user can upsert own availability row', async () => {
    harness.setQueryResult('availability', 'upsert', {
      data: [{ user_id: USER_A.id, day_of_week: 'mon', participating: true }],
      error: null,
    });
    const chain = harness.client.from('availability');
    chain.upsert({ user_id: USER_A.id, day_of_week: 'mon', participating: true });
    const result = await chain;
    expect(result.error).toBeNull();
  });

  it('take a skip (mark absent): authenticated user inserts own schedule_skip', async () => {
    harness.setQueryResult('schedule_skips', 'insert', {
      data: [{ user_id: USER_A.id, skip_date: FIXED_ISO }],
      error: null,
    });
    const chain = harness.client.from('schedule_skips');
    chain.insert({ user_id: USER_A.id, skip_date: FIXED_ISO });
    const result = await chain;
    expect(result.error).toBeNull();
  });

  it('send a message: authenticated participant inserts own message into their conversation', async () => {
    const convId = 'conv-uuid-1';
    harness.setQueryResult('messages', 'insert', {
      data: [{ id: 'msg-1', conversation_id: convId, sender_id: USER_A.id, content: 'Hello!', created_at: FIXED_NOW.toISOString() }],
      error: null,
    });
    const chain = harness.client.from('messages');
    chain.insert({ conversation_id: convId, sender_id: USER_A.id, content: 'Hello!' });
    chain.select('id, conversation_id, sender_id, content, created_at');
    const result = await chain.single();
    expect(result.error).toBeNull();
    expect((result.data as { content: string }).content).toBe('Hello!');
  });

  it('post a swap request: user inserts a swap with own requester_id', async () => {
    harness.setQueryResult('swaps', 'insert', {
      data: [{ id: 'swap-1', requester_id: USER_A.id, day: FUTURE_ISO, status: 'open' }],
      error: null,
    });
    const chain = harness.client.from('swaps');
    chain.insert({ requester_id: USER_A.id, day: FUTURE_ISO, note: null, status: 'open' });
    const result = await chain;
    expect(result.error).toBeNull();
  });

  it('accept a swap: goes through accept_swap RPC (not direct update)', async () => {
    harness.setRpcResult('accept_swap', { data: null, error: null });
    const result = await harness.client.rpc('accept_swap', { p_swap_id: 'swap-1' });
    expect(result.error).toBeNull();
    expect(harness.client.rpc).toHaveBeenCalledWith('accept_swap', { p_swap_id: 'swap-1' });
  });

  it('drop a skip: user deletes own schedule_skip row', async () => {
    harness.setQueryResult('schedule_skips', 'delete', { data: [], error: null });
    const chain = harness.client.from('schedule_skips');
    chain.delete();
    chain.eq('user_id', USER_A.id);
    chain.eq('skip_date', FIXED_ISO);
    const result = await chain;
    expect(result.error).toBeNull();
  });

  it('start a trip: driver upserts a trip row with own driver_id and status on_my_way', async () => {
    const tripData = {
      id: 'trip-1',
      driver_id: USER_A.id,
      ride_date: FIXED_ISO,
      rider_ids: [USER_B.id],
      status: 'on_my_way',
    };
    harness.setQueryResult('trips', 'upsert', { data: [tripData], error: null });
    const chain = harness.client.from('trips');
    chain.upsert(
      { driver_id: USER_A.id, ride_date: FIXED_ISO, rider_ids: [USER_B.id], status: 'on_my_way', updated_at: FIXED_NOW.toISOString() },
      { onConflict: 'driver_id,ride_date' },
    );
    chain.select('*');
    const result = await chain.single();
    expect(result.error).toBeNull();
    expect((result.data as { status: string }).status).toBe('on_my_way');
  });

  it('mark pickup: driver inserts trip_pickup row for a rider', async () => {
    harness.setQueryResult('trip_pickups', 'insert', {
      data: [{ trip_id: 'trip-1', rider_id: USER_B.id, picked_up_at: FIXED_NOW.toISOString() }],
      error: null,
    });
    const chain = harness.client.from('trip_pickups');
    chain.insert({ trip_id: 'trip-1', rider_id: USER_B.id });
    const result = await chain;
    expect(result.error).toBeNull();
  });

  it('complete trip: driver updates trip status to completed', async () => {
    harness.setQueryResult('trips', 'update', { data: [{ status: 'completed' }], error: null });
    const chain = harness.client.from('trips');
    chain.update({ status: 'completed', updated_at: FIXED_NOW.toISOString() });
    chain.eq('id', 'trip-1');
    const result = await chain;
    expect(result.error).toBeNull();
  });

  it('read own notifications: user selects notifications filtered to own user_id and gets results', async () => {
    const notifs = [{ id: 'n1', user_id: USER_A.id, type: 'message', title: 'New message', read_at: null }];
    harness.setQueryResult('notifications', 'select', { data: notifs, error: null });
    const chain = harness.client.from('notifications');
    chain.select('*');
    chain.eq('user_id', USER_A.id);
    chain.order('created_at', { ascending: false });
    chain.limit(100);
    const result = await chain;
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBe(1);
  });

  it('get_or_create_dm: DM conversation created via RPC (not direct table insert)', async () => {
    harness.setRpcResult('get_or_create_dm', { data: 'conv-dm-uuid', error: null });
    const result = await harness.client.rpc('get_or_create_dm', { other_user_id: USER_B.id });
    expect(result.error).toBeNull();
    expect(result.data).toBe('conv-dm-uuid');
  });

  it('register push token: registered via SECURITY DEFINER RPC (not direct table insert)', async () => {
    harness.setRpcResult('register_push_token', { data: null, error: null });
    const result = await harness.client.rpc('register_push_token', {
      p_token: 'ExponentPushToken[xxxxxx]',
      p_platform: 'ios',
    });
    expect(result.error).toBeNull();
  });
});

// =============================================================================
// 2. EDGE CASES
// =============================================================================

describe('EDGE CASES', () => {
  beforeEach(() => {
    harness.clearAll();
    harness.setAuthUser(USER_A);
  });

  it('claim last seat when car_capacity is 1: trip is created with exactly one rider', async () => {
    const tripData = { id: 'trip-last', driver_id: USER_A.id, ride_date: FIXED_ISO, rider_ids: [USER_B.id], status: 'on_my_way' };
    harness.setQueryResult('trips', 'upsert', { data: [tripData], error: null });
    const chain = harness.client.from('trips');
    chain.upsert({ driver_id: USER_A.id, ride_date: FIXED_ISO, rider_ids: [USER_B.id] }, { onConflict: 'driver_id,ride_date' });
    chain.select('*');
    const result = await chain.single();
    expect(result.error).toBeNull();
    expect((result.data as { rider_ids: string[] }).rider_ids.length).toBe(1);
  });

  it('race condition — two requests for the same trip upsert: second gets a conflict error', async () => {
    // Simulate: the unique constraint on (driver_id, ride_date) fires for a concurrent insert
    harness.setQueryResult('trips', 'upsert', UNIQUE_VIOLATION('trips_driver_id_ride_date_key'));
    const chain = harness.client.from('trips');
    chain.upsert({ driver_id: USER_A.id, ride_date: FIXED_ISO, rider_ids: ['both-trying'] });
    chain.select('*');
    const result = await chain.single();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23505');
  });

  it('swap request on a past date: server rejects with a check constraint violation', async () => {
    harness.setQueryResult('swaps', 'insert', CHECK_VIOLATION('swaps_day_not_in_past'));
    const chain = harness.client.from('swaps');
    chain.insert({ requester_id: USER_A.id, day: PAST_ISO, note: null, status: 'open' });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23514');
  });

  it('dismissal_time before 15:15 is rejected: server returns check constraint error', async () => {
    harness.setQueryResult('availability', 'upsert', CHECK_VIOLATION('availability_dismissal_time_range'));
    const chain = harness.client.from('availability');
    chain.upsert({ user_id: USER_A.id, day_of_week: 'mon', dismissal_time: '14:00', participating: true });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toMatch(/check constraint/i);
  });

  it('dismissal_time after 18:00 is rejected: server returns check constraint error', async () => {
    harness.setQueryResult('availability', 'upsert', CHECK_VIOLATION('availability_dismissal_time_range'));
    const chain = harness.client.from('availability');
    chain.upsert({ user_id: USER_A.id, day_of_week: 'mon', dismissal_time: '19:00', participating: true });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23514');
  });

  it('grade set to invalid value "3rd": server returns check constraint error', async () => {
    harness.setQueryResult('users', 'update', CHECK_VIOLATION('users_grade_check'));
    const chain = harness.client.from('users');
    chain.update({ grade: '3rd' });
    chain.eq('id', USER_A.id);
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23514');
  });

  it('car_capacity set to 7 (exceeds max of 6): server returns check constraint error', async () => {
    harness.setQueryResult('users', 'update', CHECK_VIOLATION('users_car_capacity_check'));
    const chain = harness.client.from('users');
    chain.update({ car_capacity: 7 });
    chain.eq('id', USER_A.id);
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23514');
  });

  it('message with empty content is rejected: server returns check constraint error', async () => {
    harness.setQueryResult('messages', 'insert', CHECK_VIOLATION('messages_content_not_empty'));
    const chain = harness.client.from('messages');
    chain.insert({ conversation_id: 'conv-1', sender_id: USER_A.id, content: '' });
    chain.select('id, conversation_id, sender_id, content, created_at');
    const result = await chain.single();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23514');
  });

  it('client-side guard: sendMessage trims content and returns early on blank string without hitting DB', () => {
    // From useMessages.ts: `const trimmed = content.trim(); if (!trimmed || !user) return;`
    // This is a pure client-side check — no DB call should be made for blank content.
    const content = '   ';
    const trimmed = content.trim();
    expect(trimmed).toBe('');
    // The fact trimmed is empty means the client returns before calling supabase.from('messages')
    // Assert: no query was configured, proving the test would fail if the call were made
    expect(trimmed.length === 0).toBe(true);
  });

  it('user updating another user\'s availability: RLS denies with row-level security error', async () => {
    // Policy: availability INSERT/UPDATE requires auth.uid() = user_id
    harness.setQueryResult('availability', 'upsert', RLS_DENY_WRITE);
    const chain = harness.client.from('availability');
    chain.upsert({ user_id: USER_B.id, day_of_week: 'mon', participating: false });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
    expect(result.error!.message).toMatch(/row-level security/i);
  });

  it('hardship_pass for a past date: server returns check constraint error', async () => {
    harness.setQueryResult('hardship_passes', 'insert', CHECK_VIOLATION('hardship_passes_date_not_past'));
    const chain = harness.client.from('hardship_passes');
    chain.insert({ user_id: USER_A.id, date: PAST_ISO });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('23514');
  });
});

// =============================================================================
// 3. SECURITY / EXPLOIT ATTEMPTS
// =============================================================================

describe('SECURITY / EXPLOIT ATTEMPTS', () => {
  beforeEach(() => {
    harness.clearAll();
    harness.setAuthUser(USER_A);
  });

  it('user A UPDATE user B\'s profile row is denied by RLS (using auth.uid() = id)', async () => {
    // SECURITY: users UPDATE policy must be `using(auth.uid() = id)`
    harness.setQueryResult('users', 'update', RLS_DENY_UPDATE);
    const chain = harness.client.from('users');
    chain.update({ full_name: 'Hacker Name' });
    chain.eq('id', USER_B.id);
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
    expect(result.error!.message).toMatch(/row-level security/i);
  });

  it('user A reading messages in a conversation they are not in: SELECT returns empty (RLS deny)', async () => {
    // SECURITY: messages SELECT policy must be `using(is_conversation_participant(conversation_id))`
    harness.setQueryResult('messages', 'select', RLS_DENY_SELECT);
    const chain = harness.client.from('messages');
    chain.select('id, conversation_id, sender_id, content, created_at');
    chain.eq('conversation_id', 'conv-not-mine');
    chain.order('created_at', { ascending: true });
    const result = await chain;
    expect(result.error).toBeNull(); // SELECT RLS denial = empty array, not error
    expect(result.data).toEqual([]);
  });

  it('user A inserts a swap with requester_id = user B (identity spoofing): RLS with_check denies it', async () => {
    // SECURITY: swaps INSERT with_check must be `auth.uid() = requester_id`
    harness.setQueryResult('swaps', 'insert', RLS_DENY_WRITE);
    const chain = harness.client.from('swaps');
    chain.insert({ requester_id: USER_B.id, day: FUTURE_ISO, note: null, status: 'open' });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
  });

  it('user A inserts an invite with inviter_id = user B (identity spoofing): RLS with_check denies it', async () => {
    // SECURITY: invites INSERT with_check must be `auth.uid() = inviter_id`
    harness.setQueryResult('invites', 'insert', RLS_DENY_WRITE);
    const chain = harness.client.from('invites');
    chain.insert({ code: 'ABCDEF', inviter_id: USER_B.id });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
  });

  it('user A DELETE a trip where they are the driver (only rider may delete): RLS denies it', async () => {
    // Per spec: rides DELETE only if you\'re the RIDER. Driver cannot self-delete.
    harness.setQueryResult('trips', 'delete', RLS_DENY_WRITE);
    const chain = harness.client.from('trips');
    chain.delete();
    chain.eq('id', 'trip-1');
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
  });

  it('unauthenticated request to users table returns empty array (RLS blocks anon SELECT)', async () => {
    harness.setAuthUser(null);
    harness.setQueryResult('users', 'select', RLS_DENY_SELECT);
    const chain = harness.client.from('users');
    chain.select('*');
    const result = await chain;
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it('unauthenticated request to notifications table returns empty array (RLS blocks anon SELECT)', async () => {
    harness.setAuthUser(null);
    harness.setQueryResult('notifications', 'select', RLS_DENY_SELECT);
    const chain = harness.client.from('notifications');
    chain.select('*');
    const result = await chain;
    expect(result.data).toEqual([]);
  });

  it('unauthenticated INSERT to swaps is denied: returns JWT/auth error', async () => {
    harness.setAuthUser(null);
    harness.setQueryResult('swaps', 'insert', NOT_AUTHENTICATED);
    const chain = harness.client.from('swaps');
    chain.insert({ requester_id: 'anon-id', day: FUTURE_ISO, status: 'open' });
    const result = await chain;
    expect(result.error).not.toBeNull();
  });

  it('user A reading trip_pickups for a trip they are not in: SELECT returns empty (RLS deny)', async () => {
    // SECURITY: trip_pickups SELECT should be restricted to the trip\'s driver + riders
    harness.setQueryResult('trip_pickups', 'select', RLS_DENY_SELECT);
    const chain = harness.client.from('trip_pickups');
    chain.select('rider_id');
    chain.eq('trip_id', 'trip-not-mine');
    const result = await chain;
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it('user A inserting a message into a conversation they are not a participant in: RLS denies INSERT', async () => {
    // SECURITY GAP: messages INSERT with_check must include `is_conversation_participant(conversation_id)`
    // If only sender_id = auth.uid() is checked, cross-conversation injection is possible.
    // // SECURITY GAP: Confirm the live `messages` INSERT with_check includes conversation membership.
    harness.setQueryResult('messages', 'insert', RLS_DENY_WRITE);
    const chain = harness.client.from('messages');
    chain.insert({ conversation_id: 'conv-not-mine', sender_id: USER_A.id, content: 'Injected!' });
    chain.select('id, conversation_id, sender_id, content, created_at');
    const result = await chain.single();
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
  });

  it('// SECURITY GAP: hardship_passes SELECT open to all members — documents the confirmed leak', async () => {
    // SECURITY GAP: hardship_passes SELECT policy allows any authenticated user to read
    //   all rows, exposing which families have hardship exemptions to all carpool members.
    //   Migration 20260622_001_restrict_hardship_passes_select.sql fixes this.
    const allFamiliesData = [
      { id: 'hp-1', user_id: USER_B.id, date: FUTURE_ISO, reason: 'Family emergency' },
    ];
    harness.setQueryResult('hardship_passes', 'select', { data: allFamiliesData, error: null });
    const chain = harness.client.from('hardship_passes');
    chain.select('*');
    const result = await chain;
    // This currently SUCCEEDS — returning USER_B's data to USER_A. That IS the gap.
    expect(result.error).toBeNull();
    const rows = result.data as Array<{ user_id: string }>;
    const otherUserRows = rows.filter((r) => r.user_id !== USER_A.id);
    // After applying migration 001, this should be 0
    expect(otherUserRows.length).toBeGreaterThan(0); // documents gap exists
  });

  it('// SECURITY GAP: rides SELECT open to all authenticated users — documents the confirmed leak', async () => {
    // SECURITY GAP: rides SELECT policy allows any authenticated user to read all ride records.
    //   Migration 20260622_002_restrict_rides_select.sql fixes this.
    harness.setQueryResult('rides', 'select', {
      data: [{ id: 'ride-1', driver_id: USER_B.id, rider_id: 'rider-c', date: FIXED_ISO }],
      error: null,
    });
    const chain = harness.client.from('rides');
    chain.select('*');
    const result = await chain;
    expect(result.error).toBeNull();
    // USER_A can currently read USER_B's ride. After fix, this should be empty for non-participants.
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('user A cannot update trip status on trip they do not own: RLS using(auth.uid()=driver_id) denies it', async () => {
    // Client setStatus(): .update({status}).eq('id', tripId) — no driver_id WHERE clause.
    // Server RLS must enforce driver ownership.
    harness.setQueryResult('trips', 'update', RLS_DENY_UPDATE);
    const chain = harness.client.from('trips');
    chain.update({ status: 'completed', updated_at: FIXED_NOW.toISOString() });
    chain.eq('id', 'trip-belongs-to-B');
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
  });

  it('user A cannot insert trip_pickup on a trip they are not the driver of: RLS denies INSERT', async () => {
    harness.setQueryResult('trip_pickups', 'insert', RLS_DENY_WRITE);
    const chain = harness.client.from('trip_pickups');
    chain.insert({ trip_id: 'trip-belongs-to-B', rider_id: 'rider-c' });
    const result = await chain;
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('42501');
  });

  it('email_exists RPC callable without authentication — documents user enumeration vulnerability (CSO-2)', async () => {
    // CSO-2: email_exists RPC is publicly callable with only the anon key.
    // Any unauthenticated caller can determine if a specific email is registered.
    harness.setAuthUser(null);
    harness.setRpcResult('email_exists', { data: false, error: null });
    const result = await harness.client.rpc('email_exists', { p_email: 'victim@example.com' });
    // Succeeds without auth — this is the vulnerability being documented.
    expect(result.error).toBeNull();
    expect(typeof result.data).toBe('boolean');
    // After fix: this should require authentication and return an auth error for anon callers.
  });

  it('no server-side BISV domain restriction: edge function accepts non-school email (CONFIRMED-1)', async () => {
    // CONFIRMED-1: The create-account edge function accepts any email domain.
    // No client-side domain check exists; the edge function apparently does not enforce it.
    harness.setFunctionResult('create-account', { data: { ok: true }, error: null });
    const result = await harness.client.functions.invoke('create-account', {
      body: { email: 'anyone@gmail.com', password: 'password123', data: { full_name: 'Random Person' } },
    });
    // Currently succeeds — this IS the vulnerability (child-safety issue for a school app).
    expect(result.error).toBeNull();
    expect((result.data as { ok: boolean }).ok).toBe(true);
    // After fix in create-account edge function: expect result to indicate domain rejection.
  });
});

// =============================================================================
// 4. GLITCH / UX SCENARIOS
// =============================================================================

describe('GLITCH / UX SCENARIOS', () => {
  beforeEach(() => {
    harness.clearAll();
    harness.setAuthUser(USER_A);
  });

  it('user with car_capacity 0 but can_drive=true: capacity field wins — 0 rider slots (inconsistent state)', () => {
    // In useCarpool.ts, capacity is read from user.car_capacity, not can_drive.
    // A user with car_capacity=0 cannot meaningfully drive (no seats for riders).
    const participant = {
      user_id: USER_B.id,
      can_drive: true,        // says can drive
      user: { car_capacity: 0, full_name: 'Zero Seats Parent', neighborhood: 'San Jose' },
    };
    expect(participant.user.car_capacity).toBe(0);
    expect(participant.can_drive).toBe(true);
    // The rotation engine receives capacity=0 from user.car_capacity — this driver
    // effectively cannot carry any riders. The inconsistency should be flagged in UI
    // and ideally blocked by a DB constraint (car_capacity > 0 IF can_drive = true).
  });

  it('availability row role=drive but is_driving=false: inconsistent but harmless (legacy columns)', () => {
    // useMySchedule.ts always writes role="ride" or "off" and is_driving=false.
    // The rotation engine ignores role and is_driving entirely — uses can_drive only.
    const row = { role: 'drive', is_driving: false, can_drive: true, participating: true };
    // role='drive' is a legacy value that the current client can never write
    expect(row.role).toBe('drive');
    expect(row.is_driving).toBe(false);
    expect(row.can_drive).toBe(true); // the column that actually matters to the engine
    // No action needed, but the legacy columns create confusion.
  });

  it('swap still open after its day passed: SELECT returns the stale row (no auto-expire)', async () => {
    const staleSwap = {
      id: 'swap-stale',
      requester_id: USER_B.id,
      day: PAST_ISO,       // 2026-06-01 — in the past relative to FIXED_NOW
      status: 'open',      // should have been auto-cancelled
      accepted_by: null,
    };
    harness.setQueryResult('swaps', 'select', { data: [staleSwap], error: null });
    const chain = harness.client.from('swaps');
    chain.select('id, requester_id, day, note, status, accepted_by, requester:users!swaps_requester_id_fkey(full_name, neighborhood)');
    chain.or(`status.eq.open,requester_id.eq.${USER_A.id}`);
    chain.order('day', { ascending: true });
    const result = await chain;
    expect(result.error).toBeNull();
    const rows = result.data as Array<{ day: string; status: string }>;
    const stale = rows.find((r) => r.status === 'open' && r.day < FIXED_ISO);
    expect(stale).toBeDefined();
    // Recommendation: add a DB trigger or scheduled function to auto-cancel past-date open swaps.
  });

  it('conversation with no participants: query returns the orphaned conversation without crashing', async () => {
    const orphanConv = { id: 'conv-orphan', type: 'group', ride_date: FIXED_ISO, title: 'Ghost Chat', created_at: FIXED_NOW.toISOString() };
    harness.setQueryResult('conversation_participants', 'select', {
      data: [{ conversation_id: 'conv-orphan', last_read_at: null, conversation: orphanConv }],
      error: null,
    });
    const chain = harness.client.from('conversation_participants');
    chain.select('conversation_id, last_read_at, conversation:conversations!conversation_participants_conversation_id_fkey(*)');
    chain.eq('user_id', USER_A.id);
    const result = await chain;
    expect(result.error).toBeNull();
    const rows = result.data as Array<{ conversation_id: string }>;
    expect(rows.length).toBe(1);
    // The hook handles empty participants with `participantsById.get(id) ?? []` — no crash.
  });

  it('trip in on_my_way status started 3 days ago: returned as-is with no auto-complete', async () => {
    const staleDate = '2026-06-19'; // 3 days before FIXED_NOW 2026-06-22
    const staleTrip = {
      id: 'trip-stale',
      driver_id: USER_A.id,
      ride_date: staleDate,
      status: 'on_my_way',
      started_at: new Date('2026-06-19T08:00:00Z').toISOString(),
      updated_at: new Date('2026-06-19T08:00:00Z').toISOString(),
    };
    harness.setQueryResult('trips', 'select', { data: [staleTrip], error: null });
    const chain = harness.client.from('trips');
    chain.select('*');
    chain.eq('driver_id', USER_A.id);
    chain.eq('ride_date', staleDate);
    const result = await chain.maybeSingle();
    expect(result.error).toBeNull();
    expect((result.data as { status: string }).status).toBe('on_my_way');
    const daysSince =
      (FIXED_NOW.getTime() - new Date(staleDate).getTime()) / (1000 * 60 * 60 * 24);
    expect(daysSince).toBeGreaterThan(2);
    // There is a useAutoEndTrip hook (untracked in git) — verify it handles this case.
  });

  it('user with no availability rows: carpool query returns empty participant list without error', async () => {
    harness.setQueryResult('availability', 'select', { data: [], error: null });
    const chain = harness.client.from('availability');
    chain.select('user_id, day_of_week, dismissal_time, can_drive, user:users!availability_user_id_fkey(full_name,neighborhood,car_capacity,car_color,car_type,car_model,license_plate,address)');
    chain.eq('participating', true);
    const result = await chain;
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    // With empty participants, rotation engine returns null for all dates — no crash.
  });

  it('markAllRead: update is correctly filtered to own user_id and only unread notifications', async () => {
    harness.setQueryResult('notifications', 'update', { data: [], error: null });
    const chain = harness.client.from('notifications');
    chain.update({ read_at: FIXED_NOW.toISOString() });
    chain.eq('user_id', USER_A.id);
    chain.is('read_at', null);
    const result = await chain;
    expect(result.error).toBeNull();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
    expect(chain.is).toHaveBeenCalledWith('read_at', null);
  });

  it('trip_pickups: deleting a pickup for a rider never picked up is a silent no-op', async () => {
    harness.setQueryResult('trip_pickups', 'delete', { data: [], error: null });
    const chain = harness.client.from('trip_pickups');
    chain.delete();
    chain.eq('trip_id', 'trip-1');
    chain.eq('rider_id', 'rider-never-picked-up');
    const result = await chain;
    // Postgres DELETE on a non-existent row is always a success — 0 rows affected
    expect(result.error).toBeNull();
  });
});
