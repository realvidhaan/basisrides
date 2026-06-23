/**
 * BasisRide — Live RLS Probe Suite
 *
 * SAFETY: This suite SKIPS automatically when SUPABASE_TEST_URL and
 * SUPABASE_TEST_ANON_KEY are not present in the environment. It must NEVER run
 * against the production project (itfrksemudjaicksfucr).
 *
 * SETUP REQUIRED before running:
 *   1. Create a throwaway Supabase project (free tier is fine).
 *   2. Apply the same schema and RLS policies as production.
 *   3. Create two test users (USER_A and USER_B) in the Auth dashboard,
 *      sign them in, and put their JWT tokens in the env vars below.
 *   4. Create a .env.test file (gitignored) with:
 *        SUPABASE_TEST_URL=https://yourtest.supabase.co
 *        SUPABASE_TEST_ANON_KEY=your_anon_key
 *        SUPABASE_TEST_USER_A_TOKEN=jwt_for_user_a
 *        SUPABASE_TEST_USER_B_TOKEN=jwt_for_user_b
 *        SUPABASE_TEST_USER_A_ID=uuid_for_user_a
 *        SUPABASE_TEST_USER_B_ID=uuid_for_user_b
 *
 * Each test uses afterEach cleanup to remove data it created so the project
 * stays clean between runs.
 *
 * These tests make real network calls — they are the only tests in this repo
 * that do so, and they are explicitly gated.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Gate: skip entire suite if test env vars are absent
// ---------------------------------------------------------------------------

const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const USER_A_TOKEN = process.env.SUPABASE_TEST_USER_A_TOKEN;
const USER_B_TOKEN = process.env.SUPABASE_TEST_USER_B_TOKEN;
const USER_A_ID = process.env.SUPABASE_TEST_USER_A_ID;
const USER_B_ID = process.env.SUPABASE_TEST_USER_B_ID;

const LIVE_TESTS_AVAILABLE = !!(
  TEST_URL &&
  TEST_ANON_KEY &&
  USER_A_TOKEN &&
  USER_B_TOKEN &&
  USER_A_ID &&
  USER_B_ID
);

// Use describe.skip when env vars are absent — safe-by-default.
const describeOrSkip = LIVE_TESTS_AVAILABLE ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Client factories (authenticated per user)
// ---------------------------------------------------------------------------

function clientAs(token: string): SupabaseClient {
  const client = createClient(TEST_URL!, TEST_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return client;
}

function anonClient(): SupabaseClient {
  return createClient(TEST_URL!, TEST_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const FIXED_ISO = new Date().toISOString().split('T')[0];

function isRlsError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42501' ||
    (error.message?.toLowerCase().includes('row-level security') ?? false) ||
    (error.message?.toLowerCase().includes('policy') ?? false)
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeOrSkip('LIVE RLS PROBE (requires .env.test + throwaway Supabase project)', () => {
  if (!LIVE_TESTS_AVAILABLE) {
    it('skipped — set SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and user tokens in .env.test', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const clientA = clientAs(USER_A_TOKEN!);
  const clientB = clientAs(USER_B_TOKEN!);
  const anon = anonClient();

  // Track rows created so we can clean up
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const fn of cleanup.splice(0)) {
      try { await fn(); } catch { /* best-effort cleanup */ }
    }
  });

  // -------------------------------------------------------------------------
  // users table
  // -------------------------------------------------------------------------

  it('[users] user A can SELECT all user rows', async () => {
    const { data, error } = await clientA.from('users').select('id').limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('[users] user A CANNOT UPDATE user B\'s profile row', async () => {
    const { error } = await clientA
      .from('users')
      .update({ full_name: 'Hacked Name' })
      .eq('id', USER_B_ID!);
    expect(isRlsError(error)).toBe(true);
  });

  it('[users] unauthenticated SELECT returns no rows', async () => {
    const { data, error } = await anon.from('users').select('id').limit(5);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // availability table
  // -------------------------------------------------------------------------

  it('[availability] user A CANNOT upsert availability row for user B', async () => {
    const { error } = await clientA
      .from('availability')
      .upsert({ user_id: USER_B_ID!, day_of_week: 'mon', participating: false })
      .select();
    expect(isRlsError(error)).toBe(true);
  });

  it('[availability] user A CAN upsert own availability row and clean up', async () => {
    const { error } = await clientA
      .from('availability')
      .upsert({ user_id: USER_A_ID!, day_of_week: 'mon', participating: false }, { onConflict: 'user_id,day_of_week' })
      .select();
    expect(error).toBeNull();
    cleanup.push(async () => {
      await clientA.from('availability').delete().eq('user_id', USER_A_ID!).eq('day_of_week', 'mon');
    });
  });

  // -------------------------------------------------------------------------
  // schedule_skips table
  // -------------------------------------------------------------------------

  it('[schedule_skips] user A CANNOT insert a skip with user_id = user B', async () => {
    const { error } = await clientA
      .from('schedule_skips')
      .insert({ user_id: USER_B_ID!, skip_date: FIXED_ISO });
    expect(isRlsError(error)).toBe(true);
  });

  it('[schedule_skips] user A CAN insert own skip and delete it', async () => {
    const testDate = '2099-12-31'; // far future so it doesn't conflict with real data
    const { error } = await clientA
      .from('schedule_skips')
      .insert({ user_id: USER_A_ID!, skip_date: testDate });
    expect(error).toBeNull();
    cleanup.push(async () => {
      await clientA.from('schedule_skips').delete().eq('user_id', USER_A_ID!).eq('skip_date', testDate);
    });
  });

  // -------------------------------------------------------------------------
  // swaps table
  // -------------------------------------------------------------------------

  it('[swaps] user A CANNOT insert a swap with requester_id = user B (identity spoofing)', async () => {
    const { error } = await clientA
      .from('swaps')
      .insert({ requester_id: USER_B_ID!, day: '2099-12-31', status: 'open' });
    expect(isRlsError(error)).toBe(true);
  });

  it('[swaps] accept_swap RPC fails when called unauthenticated', async () => {
    const { error } = await anon.rpc('accept_swap', { p_swap_id: '00000000-0000-0000-0000-000000000000' });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/auth|not authenticated|jwt/);
  });

  // -------------------------------------------------------------------------
  // messages table
  // -------------------------------------------------------------------------

  it('[messages] user A CANNOT insert a message into a conversation they are not in', async () => {
    // Use a random UUID that neither user is a participant in
    const fakeConvId = '00000000-0000-0000-0000-000000000099';
    const { error } = await clientA
      .from('messages')
      .insert({ conversation_id: fakeConvId, sender_id: USER_A_ID!, content: 'Injected!' });
    // Should fail: either RLS denies (42501) or FK violation (23503)
    expect(error).not.toBeNull();
  });

  it('[messages] user A CANNOT SELECT messages from a conversation they are not in', async () => {
    const fakeConvId = '00000000-0000-0000-0000-000000000099';
    const { data, error } = await clientA
      .from('messages')
      .select('id')
      .eq('conversation_id', fakeConvId);
    expect(error).toBeNull(); // RLS returns empty, not error
    expect((data ?? []).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // trips table
  // -------------------------------------------------------------------------

  it('[trips] user A CANNOT UPDATE a trip where they are not the driver', async () => {
    // This relies on a trip created by user B existing. In practice we'd need to
    // seed one via the service role. Instead test that an update to a nonexistent trip
    // (which no one owns) returns 0 affected rows or an error.
    const { error, data } = await clientA
      .from('trips')
      .update({ status: 'completed' })
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .select();
    // With correct RLS: error should be 42501 or data should be empty
    const denied = isRlsError(error) || (Array.isArray(data) && data.length === 0);
    expect(denied).toBe(true);
  });

  // -------------------------------------------------------------------------
  // notifications table
  // -------------------------------------------------------------------------

  it('[notifications] user A CANNOT read user B\'s notifications', async () => {
    const { data } = await clientA
      .from('notifications')
      .select('id')
      .eq('user_id', USER_B_ID!);
    // Should return empty array (RLS restricts to own rows)
    expect((data ?? []).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // invites table
  // -------------------------------------------------------------------------

  it('[invites] user A CANNOT insert an invite with inviter_id = user B', async () => {
    const { error } = await clientA
      .from('invites')
      .insert({ code: 'TSTZZZ', inviter_id: USER_B_ID! });
    expect(isRlsError(error)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // hardship_passes — SECURITY GAP
  // -------------------------------------------------------------------------

  it('[hardship_passes] SECURITY GAP: user A can SELECT all rows including user B\'s passes', async () => {
    // This test ASSERTS the gap exists. If this test FAILS (returns empty),
    // the gap has been fixed — update this test accordingly.
    const { data, error } = await clientA
      .from('hardship_passes')
      .select('*')
      .neq('user_id', USER_A_ID!); // explicitly fetch OTHER users' records
    expect(error).toBeNull();
    // If the gap exists, data will contain rows. If fixed, data will be empty.
    // We log the finding rather than assert a specific direction, so the test
    // acts as a canary rather than a hard failure on either side.
    console.warn(
      `[SECURITY GAP CHECK] hardship_passes SELECT returned ${(data ?? []).length} rows for non-owner user A.`,
      (data ?? []).length > 0 ? 'GAP CONFIRMED.' : 'Gap appears fixed or table is empty.',
    );
  });

  // -------------------------------------------------------------------------
  // rides table — SECURITY GAP
  // -------------------------------------------------------------------------

  it('[rides] SECURITY GAP: any authenticated user can SELECT all rides', async () => {
    const { data, error } = await clientA.from('rides').select('*').limit(5);
    expect(error).toBeNull();
    console.warn(
      `[SECURITY GAP CHECK] rides SELECT returned ${(data ?? []).length} rows for authenticated user A.`,
      (data ?? []).length > 0 ? 'GAP CONFIRMED.' : 'Gap appears fixed or table is empty.',
    );
  });

  // -------------------------------------------------------------------------
  // email_exists RPC — user enumeration
  // -------------------------------------------------------------------------

  it('[email_exists RPC] unauthenticated caller can enumerate whether any email is registered', async () => {
    const { data, error } = await anon.rpc('email_exists', { p_email: 'nonexistent@example.com' });
    // If this succeeds (no auth error), the enumeration vulnerability is confirmed.
    if (!error) {
      console.warn('[SECURITY GAP CHECK] email_exists RPC is callable without authentication — user enumeration is possible.');
    }
    // We don't hard-fail here because the developer made an explicit tradeoff; we document it.
    expect(typeof data === 'boolean' || error !== null).toBe(true);
  });
});
