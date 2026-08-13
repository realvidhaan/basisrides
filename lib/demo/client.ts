/**
 * Demo mode — a fake supabase-js.
 *
 * This is the whole interception seam. Every hook, query string, realtime
 * handler and screen runs its real production code path against this object;
 * nothing in `hooks/`, `lib/pairing.ts` or `lib/schoolCalendar.ts` learns that
 * the demo exists. That is why the surface here is shaped by what the app
 * actually calls rather than by what supabase-js offers: 12 tables, 5 embedded
 * joins, 7 RPCs, 2 edge functions, 7 channels.
 *
 * The return type is `unknown` on purpose. Typing it as `SupabaseClient` would
 * mean reproducing the generic `PostgrestQueryBuilder` chain; instead there is a
 * single `as unknown as SupabaseClient` cast, in `lib/supabase.ts`.
 */
import {
  DEMO_USERS,
  PRESENTER_ID,
} from '@/lib/demo/fixtures';
import {
  deleteRows,
  getSession,
  insertRows,
  onAuthChange,
  readTable,
  readTableRaw,
  sendBroadcast,
  setSession,
  subscribeBroadcast,
  subscribeChanges,
  updateRows,
  upsertRows,
  type ChangeEvent,
  type ChangePayload,
  type DemoError,
  type DemoSession,
  type DemoTable,
  type Row,
} from '@/lib/demo/store';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

interface QueryResult {
  data: unknown;
  error: DemoError | null;
  count: null;
  status: number;
  statusText: string;
}

function ok(data: unknown, status = 200, statusText = 'OK'): QueryResult {
  return { data, error: null, count: null, status, statusText };
}

function fail(error: DemoError, status: number, statusText: string): QueryResult {
  return { data: null, error, count: null, status, statusText };
}

/** The exact PostgREST shape for `.single()` over anything but one row. */
function notExactlyOneRow(count: number): QueryResult {
  return fail(
    {
      message: 'JSON object requested, multiple (or no) rows returned',
      details: `The result contains ${count} rows`,
      hint: null,
      code: 'PGRST116',
    },
    406,
    'Not Acceptable',
  );
}

// ---------------------------------------------------------------------------
// Embedded joins
// ---------------------------------------------------------------------------

/**
 * The closed set of `!constraint` embeds in the codebase, keyed by constraint
 * name. Do NOT try to infer the FK from the alias — `user:users!…` appears twice
 * with two different foreign keys.
 *
 * An unmapped constraint here is the single most likely cause of a silently
 * empty screen: `hooks/useCarpool.ts:131` skips every row whose `user` failed to
 * hydrate, which renders "Not carpooling this day" with no error anywhere. So a
 * miss throws in dev rather than returning null.
 */
const FK_BY_CONSTRAINT: Record<string, { table: DemoTable; column: string; target: DemoTable }> = {
  availability_user_id_fkey: { table: 'availability', column: 'user_id', target: 'users' },
  swaps_requester_id_fkey: { table: 'swaps', column: 'requester_id', target: 'users' },
  conversation_participants_conversation_id_fkey: {
    table: 'conversation_participants',
    column: 'conversation_id',
    target: 'conversations',
  },
  conversation_participants_user_id_fkey: {
    table: 'conversation_participants',
    column: 'user_id',
    target: 'users',
  },
  messages_sender_id_fkey: { table: 'messages', column: 'sender_id', target: 'users' },
};

interface Embed {
  alias: string;
  column: string;
  target: DemoTable;
}

/** Split on commas at paren-depth 0, so an embed's inner column list stays whole. */
function splitTopLevel(spec: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of spec) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * The ONE thing parsed out of a select string. The plain column list is ignored
 * entirely — returning extra fields is harmless because every consumer reads
 * named properties and the two casts in the app (`data as Trip`,
 * `data as UserProfile`) are structural, not runtime validation.
 */
function parseEmbeds(spec: string | undefined): Embed[] {
  if (!spec || !spec.includes('!')) return [];
  const embeds: Embed[] = [];
  for (const raw of splitTopLevel(spec)) {
    const term = raw.trim();
    const m = /^(\w+):(\w+)!(\w+)\((.*)\)$/.exec(term);
    if (!m) continue;
    const [, alias, , constraint] = m;
    const fk = FK_BY_CONSTRAINT[constraint];
    if (!fk) {
      const message = `[demo] unmapped embed constraint "${constraint}" — add it to FK_BY_CONSTRAINT`;
      if (__DEV__) throw new Error(message);
      console.warn(message);
      continue;
    }
    embeds.push({ alias, column: fk.column, target: fk.target });
  }
  return embeds;
}

/**
 * Every embed in the codebase is many-to-one, so the hydrated value is a single
 * object or null. Applied to a shallow copy so the store's rows never gain the
 * alias key.
 */
function hydrate(row: Row, embeds: Embed[]): Row {
  const out: Row = { ...row };
  for (const e of embeds) {
    out[e.alias] = readTable(e.target).find((t) => t.id === row[e.column]) ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * PostgREST compares over the wire, so a numeric column filtered with a string
 * (or the reverse) still matches. Only widen when one side is actually a number —
 * a blanket `String(a) === String(b)` would make `null` equal to `'null'`.
 */
function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' || typeof b === 'number') return String(a) === String(b);
  return false;
}

type Predicate = (r: Row) => boolean;

/**
 * `.or()` — one callsite, `hooks/useSwaps.ts:81`. A parse failure falls back to
 * match-all: returning nothing would blank the swap board with no clue why.
 */
function parseOr(spec: string): Predicate {
  const terms = splitTopLevel(spec).map((t) => t.trim()).filter(Boolean);
  const predicates: Predicate[] = [];
  for (const term of terms) {
    const m = /^([\w.]+)\.(eq|neq|is)\.(.*)$/.exec(term);
    if (!m) {
      if (__DEV__) console.warn(`[demo] could not parse .or() term "${term}" — matching all rows`);
      return () => true;
    }
    const [, column, op, raw] = m;
    if (op === 'eq') predicates.push((r) => looseEq(r[column], raw));
    else if (op === 'neq') predicates.push((r) => !looseEq(r[column], raw));
    else {
      const value = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
      predicates.push((r) => r[column] === value);
    }
  }
  if (predicates.length === 0) return () => true;
  return (r) => predicates.some((p) => p(r));
}

// ---------------------------------------------------------------------------
// The query builder
// ---------------------------------------------------------------------------

type Verb = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

interface OrderSpec {
  column: string;
  ascending: boolean;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function toArray(values: Row | Row[]): Row[] {
  return Array.isArray(values) ? values : [values];
}

function createBuilder(table: DemoTable) {
  let verb: Verb = 'select';
  let verbSet = false;
  let returning = false;
  let selectSpec: string | undefined;
  let payload: Row[] = [];
  let conflictColumns: string[] | undefined;
  const predicates: Predicate[] = [];
  const orders: OrderSpec[] = [];
  let limitCount: number | null = null;

  // Execution is memoized so `await` after `.single()` cannot re-run a write.
  let executed: QueryResult | null = null;

  const matches = (r: Row): boolean => predicates.every((p) => p(r));

  function run(): QueryResult {
    if (executed) return executed;

    switch (verb) {
      case 'insert': {
        const { rows, error } = insertRows(table, payload);
        executed = error
          ? fail(error, 409, 'Conflict')
          : ok(returning ? project(rows) : null, 201, 'Created');
        break;
      }
      case 'upsert': {
        const { rows, error } = upsertRows(table, payload, conflictColumns);
        executed = error
          ? fail(error, 409, 'Conflict')
          : ok(returning ? project(rows) : null, 201, 'Created');
        break;
      }
      case 'update': {
        const affected = updateRows(table, matches, payload[0] ?? {});
        executed = returning
          ? ok(project(affected))
          : ok(null, 204, 'No Content');
        break;
      }
      case 'delete': {
        const removed = deleteRows(table, matches);
        executed = returning ? ok(project(removed)) : ok(null, 204, 'No Content');
        break;
      }
      default: {
        let rows = readTable(table).filter(matches);
        for (let i = orders.length - 1; i >= 0; i -= 1) {
          const spec = orders[i];
          // Array.prototype.sort is stable in every engine RN ships on, so
          // applying the order specs in reverse gives multi-key ordering.
          rows = [...rows].sort((a, b) => {
            const c = compare(a[spec.column], b[spec.column]);
            return spec.ascending ? c : -c;
          });
        }
        if (limitCount !== null) rows = rows.slice(0, limitCount);
        executed = ok(project(rows));
        break;
      }
    }
    return executed;
  }

  function project(rows: Row[]): Row[] {
    const embeds = parseEmbeds(selectSpec);
    return rows.map((r) => hydrate(r, embeds));
  }

  const builder = {
    select(spec?: string, _opts?: { count?: string; head?: boolean }) {
      selectSpec = spec;
      // Before a write verb, `.select()` IS the verb. After one, it flips the
      // write from PostgREST's default `Prefer: return=minimal` to returning the
      // affected rows.
      if (verbSet) returning = true;
      else {
        verb = 'select';
        verbSet = true;
      }
      return builder;
    },
    insert(values: Row | Row[]) {
      verb = 'insert';
      verbSet = true;
      payload = toArray(values);
      return builder;
    },
    update(values: Row) {
      verb = 'update';
      verbSet = true;
      payload = [values];
      return builder;
    },
    upsert(values: Row | Row[], opts?: { onConflict?: string }) {
      verb = 'upsert';
      verbSet = true;
      payload = toArray(values);
      conflictColumns = opts?.onConflict?.split(',').map((c) => c.trim());
      return builder;
    },
    delete() {
      verb = 'delete';
      verbSet = true;
      return builder;
    },
    eq(column: string, value: unknown) {
      predicates.push((r) => looseEq(r[column], value));
      return builder;
    },
    neq(column: string, value: unknown) {
      predicates.push((r) => !looseEq(r[column], value));
      return builder;
    },
    in(column: string, values: unknown[]) {
      predicates.push((r) => values.some((v) => looseEq(r[column], v)));
      return builder;
    },
    is(column: string, value: null | boolean) {
      predicates.push((r) => r[column] === value);
      return builder;
    },
    or(spec: string) {
      predicates.push(parseOr(spec));
      return builder;
    },
    order(column: string, opts?: { ascending?: boolean }) {
      orders.push({ column, ascending: opts?.ascending !== false });
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },

    /**
     * The builder is a thenable, not a Promise — that is what makes
     * `await supabase.from('x').select('*')` work. Deliberately no
     * `catch`/`finally`: nothing in the app calls them on a builder and adding
     * them risks a second execution.
     */
    then<TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve()
        .then(() => run())
        .then(onFulfilled, onRejected);
    },

    single(): Promise<QueryResult> {
      return Promise.resolve().then(() => {
        const res = run();
        if (res.error) return res;
        const rows = res.data === null ? [] : (res.data as Row[]);
        if (rows.length !== 1) return notExactlyOneRow(rows.length);
        return ok(rows[0]);
      });
    },

    maybeSingle(): Promise<QueryResult> {
      return Promise.resolve().then(() => {
        const res = run();
        if (res.error) return res;
        const rows = res.data === null ? [] : (res.data as Row[]);
        if (rows.length === 0) return ok(null);
        if (rows.length > 1) return notExactlyOneRow(rows.length);
        return ok(rows[0]);
      });
    },
  };

  return builder;
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

function rpcError(message: string, code = 'P0001'): DemoError {
  return { message, details: null, hint: null, code };
}

function callerId(): string | null {
  return getSession()?.user.id ?? null;
}

function participantsOf(conversationId: unknown): string[] {
  return readTable('conversation_participants')
    .filter((p) => p.conversation_id === conversationId)
    .map((p) => String(p.user_id));
}

function runRpc(name: string, args: Record<string, unknown>): { data: unknown; error: DemoError | null } {
  switch (name) {
    case 'community_blocked_pairs': {
      // The real function is SECURITY DEFINER over the whole table and reports
      // pairs canonicalized with least/greatest, so it must NOT be scoped to the
      // caller the way readTable('blocks') is.
      const seen = new Set<string>();
      const pairs: { user_a: string; user_b: string }[] = [];
      for (const b of readTableRaw('blocks')) {
        const x = String(b.blocker_id);
        const y = String(b.blocked_id);
        const [a, z] = x < y ? [x, y] : [y, x];
        const key = `${a}|${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ user_a: a, user_b: z });
      }
      return { data: pairs, error: null };
    }

    case 'accept_swap': {
      const uid = callerId();
      const swap = readTableRaw('swaps').find((s) => s.id === args.p_swap_id);
      if (!swap || swap.status !== 'open') {
        return { data: null, error: rpcError('this cover request is no longer open') };
      }
      const me = readTableRaw('users').find((u) => u.id === uid);
      if (!me || Number(me.car_capacity) < 1) {
        // useSwaps.ts:185 regexes /car/i to choose its message — keep the word.
        return { data: null, error: rpcError('you need a car to cover a drive') };
      }
      updateRows('swaps', (s) => s.id === args.p_swap_id, {
        status: 'filled',
        accepted_by: uid,
      });
      return { data: null, error: null };
    }

    case 'register_push_token':
      // Unreachable in demo (usePushRegistration short-circuits) but it must not
      // throw if that guard is ever removed.
      return { data: null, error: null };

    case 'get_or_create_dm': {
      const uid = callerId();
      const other = args.other_user_id;
      if (!uid) return { data: null, error: rpcError('not authenticated', '42501') };

      const existing = readTable('conversations').find((c) => {
        if (c.type !== 'dm') return false;
        const members = participantsOf(c.id);
        return members.length === 2 && members.includes(uid) && members.includes(String(other));
      });
      // conversationUtils.ts:34 rejects anything that is not a plain string.
      if (existing) return { data: String(existing.id), error: null };

      const created = insertRows('conversations', [{ type: 'dm', ride_date: null, title: null }]);
      const id = String(created.rows[0].id);
      insertRows('conversation_participants', [
        { conversation_id: id, user_id: uid },
        { conversation_id: id, user_id: other },
      ]);
      return { data: id, error: null };
    }

    case 'get_or_create_group': {
      const uid = callerId();
      const rideDate = args.p_ride_date;
      const wanted = Array.isArray(args.p_participant_ids)
        ? (args.p_participant_ids as unknown[]).map(String)
        : [];
      if (uid && !wanted.includes(uid)) wanted.push(uid);

      let conversation = readTable('conversations').find(
        (c) => c.type === 'group' && c.ride_date === rideDate,
      );
      if (!conversation) {
        const created = insertRows('conversations', [
          { type: 'group', ride_date: rideDate, title: args.p_title ?? null },
        ]);
        conversation = created.rows[0];
      }
      const id = String(conversation.id);

      // Idempotent top-up, exactly like the SECURITY DEFINER original.
      const already = new Set(participantsOf(id));
      const missing = wanted.filter((m) => !already.has(m));
      if (missing.length > 0) {
        insertRows(
          'conversation_participants',
          missing.map((m) => ({ conversation_id: id, user_id: m })),
        );
      }
      return { data: id, error: null };
    }

    case 'validate_invite_code':
      // The demo signup hides the field; this exists so the call cannot 404.
      return { data: true, error: null };

    case 'email_exists':
      return { data: false, error: null };

    default: {
      const message = `function public.${name} does not exist`;
      if (__DEV__) console.warn(`[demo] ${message}`);
      return { data: null, error: { message, details: null, hint: null, code: 'PGRST202' } };
    }
  }
}

// ---------------------------------------------------------------------------
// Edge functions
// ---------------------------------------------------------------------------

/**
 * The keys SignupScreen actually sends. `car_model` is absent on purpose: the
 * signup form has no model field, so merging a `car_model: null` would wipe the
 * fixture's 'Honda Odyssey' and the presenter's CarCard would fall back to
 * "Silver minivan".
 */
const CREATE_ACCOUNT_FIELDS = [
  'full_name',
  'child_name',
  'grade',
  'neighborhood',
  'address',
  'latitude',
  'longitude',
  'car_capacity',
  'car_color',
  'car_type',
  'license_plate',
] as const;

const NUMERIC_FIELDS = new Set(['latitude', 'longitude', 'car_capacity']);

function invokeFunction(name: string, body: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  if (name === 'create-account') {
    const data = (body.data ?? {}) as Record<string, unknown>;
    const patch: Row = {};
    for (const field of CREATE_ACCOUNT_FIELDS) {
      const value = data[field];
      if (value === undefined) continue;
      patch[field] = NUMERIC_FIELDS.has(field) ? Number(value) : value;
    }
    // The presenter's row already exists (it is seeded), so signup EDITS it
    // rather than creating anything — which is also what keeps PRESENTER_ID the
    // one and only id for that person.
    updateRows('users', (r) => r.id === PRESENTER_ID, patch);
    return { data: { ok: true }, error: null };
  }

  if (name === 'delete-account') {
    setSession(null);
    return { data: { ok: true }, error: null };
  }

  return { data: null, error: { message: 'Function not found' } };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function buildSession(): DemoSession {
  const presenter = DEMO_USERS.find((u) => u.id === PRESENTER_ID)!;
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    // App.tsx:156 gates on `session !== null` and never validates the JWT.
    access_token: 'demo',
    refresh_token: 'demo',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    user: {
      id: PRESENTER_ID,
      email: presenter.email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: presenter.created_at,
    },
  };
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

interface ChangeOpts {
  event?: ChangeEvent | '*';
  schema?: string;
  table?: DemoTable;
  filter?: string;
}

function createChannel(name: string) {
  const teardowns: (() => void)[] = [];
  let subscribed = false;
  const armers: (() => () => void)[] = [];

  function arm(armer: () => () => void): void {
    if (subscribed) teardowns.push(armer());
    else armers.push(armer);
  }

  const channel = {
    topic: name,

    on(
      type: 'postgres_changes' | 'broadcast',
      opts: ChangeOpts & { event?: string },
      cb: (payload: never) => void,
    ) {
      if (type === 'postgres_changes') {
        const o = opts as ChangeOpts;
        const table = o.table;
        if (!table) {
          if (__DEV__) console.warn('[demo] postgres_changes subscription with no table');
          return channel;
        }
        arm(() =>
          subscribeChanges(table, o.event ?? '*', o.filter, cb as unknown as (p: ChangePayload) => void),
        );
      } else if (type === 'broadcast') {
        const event = String(opts.event ?? '');
        arm(() => subscribeBroadcast(name, event, cb as unknown as (m: { payload: unknown }) => void));
      } else if (__DEV__) {
        console.warn(`[demo] unsupported channel listener type "${type}"`);
      }
      return channel;
    },

    subscribe(cb?: (status: string) => void) {
      subscribed = true;
      while (armers.length > 0) teardowns.push(armers.shift()!());
      if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
      return channel;
    },

    send({ event, payload }: { type?: string; event: string; payload: unknown }): Promise<'ok'> {
      sendBroadcast(name, event, payload);
      return Promise.resolve('ok');
    },

    unsubscribe(): Promise<'ok'> {
      // Never reject: this is `void`-ed in eight cleanup paths, and an unhandled
      // rejection becomes a red LogBox overlay via lib/sentry.ts's global handler.
      try {
        while (teardowns.length > 0) teardowns.pop()!();
        armers.length = 0;
        subscribed = false;
      } catch {
        // A torn-down subscription is already in the state we want.
      }
      return Promise.resolve('ok');
    },
  };

  return channel;
}

type DemoChannel = ReturnType<typeof createChannel>;

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/**
 * Builds a fresh facade object, but NOT fresh state: tables, the session and
 * realtime subscriptions all live at module scope in `lib/demo/store.ts`, so
 * every client created in a process observes the same data. That is deliberate
 * — it mirrors a real backend, where two clients pointed at one project must
 * see each other's writes, and the app only ever constructs one.
 *
 * Tests that need a clean slate must call `__resetStore()` between cases;
 * calling `createDemoClient()` again does not give them one.
 */
export function createDemoClient(): unknown {
  return {
    from(table: DemoTable) {
      return createBuilder(table);
    },

    rpc(name: string, args?: Record<string, unknown>) {
      return Promise.resolve().then(() => runRpc(name, args ?? {}));
    },

    functions: {
      invoke(name: string, opts?: { body?: Record<string, unknown> }) {
        return Promise.resolve().then(() => invokeFunction(name, opts?.body ?? {}));
      },
    },

    auth: {
      getSession() {
        return Promise.resolve({ data: { session: getSession() }, error: null });
      },
      getUser() {
        return Promise.resolve({ data: { user: getSession()?.user ?? null }, error: null });
      },
      /**
       * Always succeeds, for whatever was typed. The demo's rejection of a
       * personal email address happens in SignupScreen's own validation, not
       * here — this is the "sign back in" path and it must never fail on stage.
       */
      signInWithPassword(_credentials: { email: string; password: string }) {
        const session = buildSession();
        setSession(session);
        return Promise.resolve({ data: { user: session.user, session }, error: null });
      },
      signOut() {
        setSession(null);
        return Promise.resolve({ error: null });
      },
      onAuthStateChange(cb: (event: string, session: DemoSession | null) => void) {
        const unsubscribe = onAuthChange(cb);
        return { data: { subscription: { unsubscribe } } };
      },
      // MANDATORY. lib/supabase.ts registers an UNGUARDED AppState listener at
      // module load that calls these on every foreground/background cycle —
      // i.e. the first time the presenter switches apps on stage.
      startAutoRefresh(): void {},
      stopAutoRefresh(): void {},
    },

    channel(name: string) {
      return createChannel(name);
    },

    removeChannel(channel: DemoChannel): Promise<'ok'> {
      try {
        return channel.unsubscribe();
      } catch {
        return Promise.resolve('ok');
      }
    },
  };
}
