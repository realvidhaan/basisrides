/**
 * Demo mode — the in-memory backend (`lib/demo/store.ts` + `lib/demo/client.ts`).
 *
 * Every assertion here maps to a numbered risk in
 * `docs/demo-architecture.md §11`, because each of these failures is SILENT on
 * stage: a missing embed blanks the Schedule screen with no error (R1), a
 * missing `startAutoRefresh` throws only on the first backgrounding (R2), an
 * unscoped `blocks` read hides other people's messages (R11), a shared
 * millisecond reorders the chat (R9), a rejecting `removeChannel` paints a red
 * LogBox over the demo (R17) and an insert that returns `null` reverts the
 * message the presenter just sent (R18).
 *
 * The suite drives the PUBLIC client surface rather than the store's internals
 * wherever it can, because the client is what the app's hooks actually hold.
 */
import { createDemoClient } from '@/lib/demo/client';
import {
  DEMO_DM_CONVERSATION_ID,
  DEMO_GROUP_CONVERSATION_ID,
  JENNA_ID,
  MARCUS_ID,
  PRESENTER_ID,
  PRIYA_ID,
  RACHEL_ID,
  TOM_ID,
} from '@/lib/demo/fixtures';
import { __resetStore, nowISO, type ChangePayload, type DemoTable, type Row } from '@/lib/demo/store';

// ---------------------------------------------------------------------------
// A structural view of the fake client.
//
// `createDemoClient()` returns `unknown` on purpose (lib/demo/client.ts:11-13):
// the app casts it once, in lib/supabase.ts. The tests do the same, against the
// narrow slice they exercise.
// ---------------------------------------------------------------------------

interface DemoResult<T> {
  data: T;
  error: { message: string; details: string | null; hint: string | null; code: string } | null;
  count: null;
  status: number;
  statusText: string;
}

interface Builder extends PromiseLike<DemoResult<Row[] | null>> {
  select(spec?: string): Builder;
  insert(values: Row | Row[]): Builder;
  update(values: Row): Builder;
  upsert(values: Row | Row[], opts?: { onConflict?: string }): Builder;
  delete(): Builder;
  eq(column: string, value: unknown): Builder;
  neq(column: string, value: unknown): Builder;
  in(column: string, values: unknown[]): Builder;
  is(column: string, value: null | boolean): Builder;
  or(spec: string): Builder;
  order(column: string, opts?: { ascending?: boolean }): Builder;
  limit(count: number): Builder;
  single(): Promise<DemoResult<Row | null>>;
  maybeSingle(): Promise<DemoResult<Row | null>>;
}

interface Channel {
  topic: string;
  on(
    type: 'postgres_changes',
    opts: { event?: string; schema?: string; table?: DemoTable; filter?: string },
    cb: (payload: ChangePayload) => void,
  ): Channel;
  subscribe(cb?: (status: string) => void): Channel;
  send(msg: { type?: string; event: string; payload: unknown }): Promise<'ok'>;
  unsubscribe(): Promise<'ok'>;
}

interface DemoClient {
  from(table: DemoTable): Builder;
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: null }>;
    signInWithPassword(c: {
      email: string;
      password: string;
    }): Promise<{ data: { session: { user: { id: string } } }; error: null }>;
    signOut(): Promise<{ error: null }>;
    startAutoRefresh(): void;
    stopAutoRefresh(): void;
  };
  channel(name: string): Channel;
  removeChannel(channel: Channel): Promise<'ok'>;
}

function client(): DemoClient {
  return createDemoClient() as DemoClient;
}

/** Rows out of a select, with the `data: null` case narrowed away. */
function rowsOf(res: DemoResult<Row[] | null>): Row[] {
  expect(res.error).toBeNull();
  expect(Array.isArray(res.data)).toBe(true);
  return res.data as Row[];
}

async function signIn(db: DemoClient): Promise<void> {
  await db.auth.signInWithPassword({ email: 'robert.calder@basisindependent.com', password: 'x' });
}

beforeEach(() => {
  __resetStore();
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe('query builder — filters', () => {
  it('.eq() narrows to the matching rows', async () => {
    const db = client();
    const rows = rowsOf(await db.from('users').select('*').eq('id', JENNA_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('Jenna Whitfield');
  });

  it('.eq() compares across the wire, so a numeric column matches a string', async () => {
    const db = client();
    // PostgREST has no types on the query string; `car_capacity` is an int4.
    const rows = rowsOf(await db.from('users').select('*').eq('car_capacity', '0'));
    expect(rows.map((r) => r.id).sort()).toEqual([MARCUS_ID, PRIYA_ID, RACHEL_ID].sort());
  });

  it('.eq(null) does NOT match the string "null"', async () => {
    const db = client();
    const rows = rowsOf(await db.from('users').select('*').eq('car_model', 'null'));
    expect(rows).toHaveLength(0);
  });

  it('.neq() excludes the matching rows', async () => {
    const db = client();
    const rows = rowsOf(await db.from('users').select('*').neq('id', PRESENTER_ID));
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.id === PRESENTER_ID)).toBe(false);
  });

  it('.in() returns exactly the listed ids', async () => {
    const db = client();
    const rows = rowsOf(await db.from('users').select('*').in('id', [PRESENTER_ID, JENNA_ID]));
    expect(rows.map((r) => r.id).sort()).toEqual([PRESENTER_ID, JENNA_ID].sort());
  });

  it('.in([]) matches nothing', async () => {
    const db = client();
    expect(rowsOf(await db.from('users').select('*').in('id', []))).toHaveLength(0);
  });

  it('.is(col, null) matches only SQL NULLs — useNotifications.markAllRead (R6)', async () => {
    const db = client();
    const unread = rowsOf(await db.from('notifications').select('*').is('read_at', null));
    expect(unread).toHaveLength(1);
    expect(unread[0].type).toBe('message');

    // …and the update that follows it only touches those rows.
    await db.from('notifications').update({ read_at: nowISO() }).eq('user_id', PRESENTER_ID).is('read_at', null);
    expect(rowsOf(await db.from('notifications').select('*').is('read_at', null))).toHaveLength(0);
  });

  it('.or() unions its terms — the swap board query (R5)', async () => {
    const db = client();
    // Seeded: one OPEN request from Rachel. Add one FILLED request from the
    // presenter (matches the second term only) and one FILLED from Marcus
    // (matches neither, and must not appear).
    await db.from('swaps').insert([
      { requester_id: PRESENTER_ID, day: '2026-09-15', status: 'filled', accepted_by: JENNA_ID },
      { requester_id: MARCUS_ID, day: '2026-09-16', status: 'filled', accepted_by: JENNA_ID },
    ]);

    const rows = rowsOf(
      await db.from('swaps').select('*').or(`status.eq.open,requester_id.eq.${PRESENTER_ID}`),
    );
    expect(rows.map((r) => r.requester_id).sort()).toEqual([PRESENTER_ID, RACHEL_ID].sort());
  });

  it('.or() falls back to match-all rather than match-none on an unparseable term', async () => {
    const db = client();
    // A silently EMPTY swap board is far worse on stage than a too-full one.
    const rows = rowsOf(await db.from('swaps').select('*').or('status=open'));
    expect(rows).toHaveLength(1);
  });

  it('predicates compose with AND', async () => {
    const db = client();
    const rows = rowsOf(
      await db.from('users').select('*').eq('neighborhood', 'San Jose').eq('car_capacity', 4),
    );
    expect(rows.map((r) => r.id).sort()).toEqual([PRESENTER_ID, JENNA_ID].sort());
  });
});

describe('query builder — order and limit', () => {
  it('.order() sorts ascending by default and descending on request', async () => {
    const db = client();
    const asc = rowsOf(
      await db
        .from('messages')
        .select('*')
        .eq('conversation_id', DEMO_GROUP_CONVERSATION_ID)
        .order('created_at', { ascending: true }),
    );
    const desc = rowsOf(
      await db
        .from('messages')
        .select('*')
        .eq('conversation_id', DEMO_GROUP_CONVERSATION_ID)
        .order('created_at', { ascending: false }),
    );
    expect(asc.map((r) => r.id)).toEqual([...desc.map((r) => r.id)].reverse());
    for (let i = 1; i < asc.length; i += 1) {
      expect(String(asc[i - 1].created_at) <= String(asc[i].created_at)).toBe(true);
    }
  });

  it('.limit() truncates AFTER ordering', async () => {
    const db = client();
    const all = rowsOf(
      await db
        .from('messages')
        .select('*')
        .eq('conversation_id', DEMO_GROUP_CONVERSATION_ID)
        .order('created_at', { ascending: false }),
    );
    const one = rowsOf(
      await db
        .from('messages')
        .select('*')
        .eq('conversation_id', DEMO_GROUP_CONVERSATION_ID)
        .order('created_at', { ascending: false })
        .limit(1),
    );
    expect(one).toHaveLength(1);
    expect(one[0].id).toBe(all[0].id);
  });

  it('does not mutate stored order when sorting', async () => {
    const db = client();
    await db.from('users').select('*').order('full_name', { ascending: false });
    const rows = rowsOf(await db.from('users').select('*'));
    expect(rows[0].id).toBe(PRESENTER_ID); // still seed order
  });
});

// ---------------------------------------------------------------------------
// Embedded joins — risk R1
// ---------------------------------------------------------------------------

describe('embedded joins (R1 — an unmapped constraint silently blanks a screen)', () => {
  it('Embed A: availability → user (useCarpool)', async () => {
    const db = client();
    const rows = rowsOf(
      await db
        .from('availability')
        .select(
          'user_id, day_of_week, dismissal_time, can_drive,' +
            ' user:users!availability_user_id_fkey(full_name,neighborhood,car_capacity,' +
            'car_color,car_type,car_model,license_plate,address)',
        )
        .eq('participating', true),
    );
    // The three generated companions × five weekdays.
    expect(rows).toHaveLength(15);
    for (const row of rows) {
      // useCarpool.ts:131 drops any row whose `user` is falsy — that is exactly
      // how a whole Schedule screen goes blank with no error.
      const user = row.user as Row | null;
      expect(user).not.toBeNull();
      expect(typeof user?.full_name).toBe('string');
      expect(user?.neighborhood).toBe('San Jose');
    }
  });

  it('Embed B: swaps → requester (useSwaps)', async () => {
    const db = client();
    const rows = rowsOf(
      await db
        .from('swaps')
        .select(
          'id, requester_id, day, note, status, accepted_by,' +
            ' requester:users!swaps_requester_id_fkey(full_name, neighborhood)',
        ),
    );
    expect(rows).toHaveLength(1);
    expect((rows[0].requester as Row).full_name).toBe('Rachel Kim');
  });

  it('Embed C: conversation_participants → conversation (useConversations)', async () => {
    const db = client();
    const rows = rowsOf(
      await db
        .from('conversation_participants')
        .select(
          'conversation_id, last_read_at,' +
            ' conversation:conversations!conversation_participants_conversation_id_fkey(*)',
        )
        .eq('user_id', PRESENTER_ID),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const conversation = row.conversation as Row | null;
      expect(conversation).not.toBeNull();
      expect(conversation?.id).toBe(row.conversation_id);
    }
    expect(rows.map((r) => (r.conversation as Row).type).sort()).toEqual(['dm', 'group']);
  });

  it('Embed D: conversation_participants → user (useConversations)', async () => {
    const db = client();
    const rows = rowsOf(
      await db
        .from('conversation_participants')
        .select('conversation_id, user:users!conversation_participants_user_id_fkey(id, full_name)')
        .eq('conversation_id', DEMO_DM_CONVERSATION_ID),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.user as Row).id).sort()).toEqual([PRESENTER_ID, TOM_ID].sort());
  });

  it('Embed E: messages → sender (useMessages)', async () => {
    const db = client();
    const rows = rowsOf(
      await db
        .from('messages')
        .select('id, conversation_id, sender_id, content, created_at, sender:users!messages_sender_id_fkey(full_name)')
        .eq('conversation_id', DEMO_GROUP_CONVERSATION_ID),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => (r.sender as Row).full_name)).toEqual([
      'Priya Raghavan',
      'Marcus Delgado',
      'Jenna Whitfield',
    ]);
  });

  it('hydrates to null — not to a wrong row — when the referenced row is gone', async () => {
    const db = client();
    await db.from('messages').insert({
      conversation_id: DEMO_GROUP_CONVERSATION_ID,
      sender_id: '00000000-0000-4000-8000-00000000dead',
      content: 'ghost',
    });
    const rows = rowsOf(
      await db
        .from('messages')
        .select('id, sender:users!messages_sender_id_fkey(full_name)')
        .eq('content', 'ghost'),
    );
    expect(rows[0].sender).toBeNull();
  });

  it('never writes the alias back onto the stored row', async () => {
    const db = client();
    await db
      .from('messages')
      .select('id, sender:users!messages_sender_id_fkey(full_name)')
      .eq('conversation_id', DEMO_GROUP_CONVERSATION_ID);
    const plain = rowsOf(await db.from('messages').select('*'));
    for (const row of plain) expect('sender' in row).toBe(false);
  });

  it('an UNMAPPED constraint fails loudly in dev instead of blanking the screen', async () => {
    expect(__DEV__).toBe(true); // the demo is only ever run from a dev bundle
    const db = client();
    await expect(
      db.from('availability').select('user_id, user:users!availability_no_such_fkey(full_name)'),
    ).rejects.toThrow(/unmapped embed constraint/);
  });
});

// ---------------------------------------------------------------------------
// Terminals — risk R18
// ---------------------------------------------------------------------------

describe('.single() / .maybeSingle()', () => {
  it('returns the PGRST116 shape for zero rows', async () => {
    const db = client();
    const res = await db.from('users').select('*').eq('id', 'nobody').single();
    expect(res.data).toBeNull();
    expect(res.status).toBe(406);
    expect(res.statusText).toBe('Not Acceptable');
    expect(res.error).toEqual({
      message: 'JSON object requested, multiple (or no) rows returned',
      details: 'The result contains 0 rows',
      hint: null,
      code: 'PGRST116',
    });
  });

  it('returns the PGRST116 shape for more than one row', async () => {
    const db = client();
    const res = await db.from('users').select('*').single();
    expect(res.error?.code).toBe('PGRST116');
    expect(res.error?.details).toBe('The result contains 6 rows');
  });

  it('.maybeSingle() returns null data with NO error for zero rows', async () => {
    const db = client();
    const res = await db.from('users').select('*').eq('id', 'nobody').maybeSingle();
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
  });

  it('insert + .select().single() returns the inserted row (R18)', async () => {
    const db = client();
    const res = await db
      .from('messages')
      .insert({
        conversation_id: DEMO_GROUP_CONVERSATION_ID,
        sender_id: PRESENTER_ID,
        content: 'Running five minutes late',
      })
      .select('id, conversation_id, sender_id, content, created_at')
      .single();

    // useMessages.ts:203 throws 'send failed' on `insErr || !data` and reverts
    // the optimistic bubble the presenter just watched appear.
    expect(res.error).toBeNull();
    const row = res.data as Row;
    expect(row.content).toBe('Running five minutes late');
    expect(row.conversation_id).toBe(DEMO_GROUP_CONVERSATION_ID);
    expect(typeof row.id).toBe('string');
    expect(typeof row.created_at).toBe('string');
  });

  it('a bare insert returns data: null with 201, and still persists', async () => {
    const db = client();
    const res = await db
      .from('messages')
      .insert({ conversation_id: DEMO_DM_CONVERSATION_ID, sender_id: PRESENTER_ID, content: 'x' });
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
    expect(res.status).toBe(201);
    expect(rowsOf(await db.from('messages').select('*').eq('content', 'x'))).toHaveLength(1);
  });

  it('awaiting after .single() cannot execute the write twice', async () => {
    const db = client();
    const chain = db
      .from('messages')
      .insert({ conversation_id: DEMO_DM_CONVERSATION_ID, sender_id: PRESENTER_ID, content: 'once' })
      .select('*');
    await chain.single();
    await chain;
    expect(rowsOf(await db.from('messages').select('*').eq('content', 'once'))).toHaveLength(1);
  });

  it('surfaces 23505 with the wording useSwaps regexes for', async () => {
    const db = client();
    const res = await db
      .from('schedule_skips')
      .insert({ user_id: PRESENTER_ID, skip_date: '2026-09-16' });
    expect(res.error).toBeNull();
    const dup = await db
      .from('schedule_skips')
      .insert({ user_id: PRESENTER_ID, skip_date: '2026-09-16' });
    expect(dup.error?.code).toBe('23505');
    expect(dup.error?.message).toMatch(/duplicate|unique/);
  });

  it('upsert merges instead of raising 23505', async () => {
    const db = client();
    for (const can of [true, false]) {
      const res = await db.from('availability').upsert(
        {
          user_id: PRESENTER_ID,
          day_of_week: 'mon',
          participating: true,
          dismissal_time: '15:45:00',
          can_drive: can,
        },
        { onConflict: 'user_id,day_of_week' },
      );
      expect(res.error).toBeNull();
    }
    const mine = rowsOf(
      await db.from('availability').select('*').eq('user_id', PRESENTER_ID).eq('day_of_week', 'mon'),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].can_drive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Realtime teardown — risk R17
// ---------------------------------------------------------------------------

describe('removeChannel (R17 — a rejection becomes a red LogBox over the demo)', () => {
  it('resolves for a channel that was subscribed', async () => {
    const db = client();
    const ch = db
      .channel('demo:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {})
      .subscribe();
    await expect(db.removeChannel(ch)).resolves.toBe('ok');
  });

  it('resolves for a channel that was never subscribed', async () => {
    const db = client();
    const ch = db
      .channel('demo:never')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps' }, () => {});
    await expect(db.removeChannel(ch)).resolves.toBe('ok');
  });

  it('resolves when removed twice (the double-cleanup path)', async () => {
    const db = client();
    const ch = db.channel('demo:twice').subscribe();
    await expect(db.removeChannel(ch)).resolves.toBe('ok');
    await expect(db.removeChannel(ch)).resolves.toBe('ok');
  });

  it('resolves even when unsubscribe itself throws', async () => {
    const db = client();
    const hostile = {
      unsubscribe(): Promise<'ok'> {
        throw new Error('torn down');
      },
    } as unknown as Channel;
    await expect(db.removeChannel(hostile)).resolves.toBe('ok');
  });

  it('actually stops delivering after removal', async () => {
    const db = client();
    const seen: ChangePayload[] = [];
    const ch = db
      .channel('demo:stop')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => seen.push(p))
      .subscribe();

    await db
      .from('messages')
      .insert({ conversation_id: DEMO_DM_CONVERSATION_ID, sender_id: TOM_ID, content: 'before' });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toHaveLength(1);
    expect(seen[0].eventType).toBe('INSERT');
    expect(seen[0].new.content).toBe('before');
    expect(seen[0].old).toEqual({});

    await db.removeChannel(ch);
    await db
      .from('messages')
      .insert({ conversation_id: DEMO_DM_CONVERSATION_ID, sender_id: TOM_ID, content: 'after' });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toHaveLength(1);
  });

  it('delivers changes on a later macrotask, never synchronously (R10)', async () => {
    const db = client();
    let delivered = false;
    db.channel('demo:async')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        delivered = true;
      })
      .subscribe();

    await db
      .from('messages')
      .insert({ conversation_id: DEMO_DM_CONVERSATION_ID, sender_id: TOM_ID, content: 'sync?' });
    expect(delivered).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(delivered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// blocks RLS emulation — risk R11
// ---------------------------------------------------------------------------

describe('blocks RLS emulation (R11 — lib/moderation.ts selects with NO filter)', () => {
  it('returns only the session user’s own block rows', async () => {
    const db = client();
    await signIn(db);
    await db.from('blocks').insert([
      { blocker_id: PRESENTER_ID, blocked_id: TOM_ID },
      { blocker_id: MARCUS_ID, blocked_id: JENNA_ID },
      { blocker_id: RACHEL_ID, blocked_id: PRESENTER_ID },
    ]);

    const mine = rowsOf(await db.from('blocks').select('*'));
    expect(mine).toHaveLength(1);
    expect(mine[0].blocked_id).toBe(TOM_ID);
  });

  it('returns nothing when there is no session', async () => {
    const db = client();
    await signIn(db);
    await db.from('blocks').insert({ blocker_id: PRESENTER_ID, blocked_id: TOM_ID });
    await db.auth.signOut();
    expect(rowsOf(await db.from('blocks').select('*'))).toHaveLength(0);
  });

  it('community_blocked_pairs stays community-wide and canonicalised', async () => {
    const db = client();
    await signIn(db);
    await db.from('blocks').insert([
      { blocker_id: PRESENTER_ID, blocked_id: TOM_ID },
      { blocker_id: MARCUS_ID, blocked_id: JENNA_ID },
      // The mirror of the first pair — the real SECURITY DEFINER function
      // deduplicates with least/greatest, so this must not double-report.
      { blocker_id: TOM_ID, blocked_id: PRESENTER_ID },
    ]);
    const { data, error } = await db.rpc('community_blocked_pairs');
    expect(error).toBeNull();
    const pairs = data as { user_a: string; user_b: string }[];
    expect(pairs).toHaveLength(2);
    for (const p of pairs) expect(p.user_a < p.user_b).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The clock — risk R9
// ---------------------------------------------------------------------------

describe('nowISO (R9 — useMessages sorts on created_at with no id tiebreak)', () => {
  it('is strictly monotonic across a tight loop', () => {
    let previous = -Infinity;
    for (let i = 0; i < 5_000; i += 1) {
      const t = new Date(nowISO()).getTime();
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
  });

  it('produces strictly increasing created_at for rows written back to back', async () => {
    const db = client();
    for (let i = 0; i < 50; i += 1) {
      await db
        .from('messages')
        .insert({ conversation_id: DEMO_DM_CONVERSATION_ID, sender_id: PRESENTER_ID, content: `m${i}` });
    }
    const rows = rowsOf(
      await db.from('messages').select('*').eq('conversation_id', DEMO_DM_CONVERSATION_ID),
    ).filter((r) => String(r.content).startsWith('m'));
    expect(rows).toHaveLength(50);
    for (let i = 1; i < rows.length; i += 1) {
      expect(String(rows[i - 1].created_at) < String(rows[i].created_at)).toBe(true);
    }
  });

  it('keeps ISO formatting, so lexicographic and chronological order agree', () => {
    const a = nowISO();
    const b = nowISO();
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(a < b).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// auth — risk R2
// ---------------------------------------------------------------------------

describe('fake auth (R2 — lib/supabase.ts calls these from an UNGUARDED AppState listener)', () => {
  it('implements startAutoRefresh / stopAutoRefresh as callable no-ops', () => {
    const db = client();
    // Their absence throws `…auth.startAutoRefresh is not a function` the first
    // time the presenter switches apps.
    expect(typeof db.auth.startAutoRefresh).toBe('function');
    expect(typeof db.auth.stopAutoRefresh).toBe('function');
    expect(db.auth.startAutoRefresh()).toBeUndefined();
    expect(db.auth.stopAutoRefresh()).toBeUndefined();
    // A whole background/foreground cycle, several times over.
    for (let i = 0; i < 5; i += 1) {
      expect(() => {
        db.auth.stopAutoRefresh();
        db.auth.startAutoRefresh();
      }).not.toThrow();
    }
  });

  it('starts signed out, and signing in yields the presenter', async () => {
    const db = client();
    expect((await db.auth.getSession()).data.session).toBeNull();
    const { data } = await db.auth.signInWithPassword({ email: 'anything@x.com', password: 'y' });
    expect(data.session.user.id).toBe(PRESENTER_ID);
    expect((await db.auth.getSession()).data.session?.user.id).toBe(PRESENTER_ID);
    await db.auth.signOut();
    expect((await db.auth.getSession()).data.session).toBeNull();
  });
});
