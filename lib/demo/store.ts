/**
 * Demo mode — the in-memory database.
 *
 * Twelve plain arrays of plain objects, a handful of write functions that behave
 * enough like PostgREST to satisfy the app's error handling, and a pub/sub layer
 * that stands in for Supabase Realtime. No indexes: the largest table is
 * `messages` at order-20 rows and the pairing engine's own walk dominates any
 * cost.
 *
 * Nothing here is persisted. A Fast Refresh or a shake-to-reload wipes every
 * message sent and every schedule edit — that is a known, accepted property of
 * the demo, not an oversight.
 */
import { DEMO_FALLBACK_PICKUP } from '@/lib/demoMode';
import {
  JENNA_ID,
  MARCUS_ID,
  PRESENTER_ID,
  PRIYA_ID,
  SEED_TABLES,
} from '@/lib/demo/fixtures';
import type { WeekdayKey } from '@/types';

export type Row = Record<string, unknown>;

export type DemoTable =
  | 'users'
  | 'availability'
  | 'schedule_skips'
  | 'swaps'
  | 'trips'
  | 'trip_pickups'
  | 'conversations'
  | 'conversation_participants'
  | 'messages'
  | 'notifications'
  | 'blocks'
  | 'reports';

export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ChangePayload {
  schema: 'public';
  table: DemoTable;
  commit_timestamp: string;
  eventType: ChangeEvent;
  new: Row; // {} on DELETE
  old: Row; // {} on INSERT
  errors: null;
}

export interface DemoError {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
}

export interface DemoSession {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    email: string;
    aud: 'authenticated';
    role: 'authenticated';
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
    created_at: string;
  };
}

// ---------------------------------------------------------------------------
// Clock and id generation
// ---------------------------------------------------------------------------

let lastMs = 0;

/**
 * Monotonic ISO timestamp — never returns the same value twice.
 *
 * `hooks/useMessages.ts:43-46` sorts messages by `created_at` alone, with no id
 * tiebreak. Two rows written in the same millisecond (a presenter question and
 * a scripted bot reply, say) would then have an arbitrary on-screen order, and
 * the reply can render above the question.
 */
export function nowISO(): string {
  const now = Date.now();
  lastMs = now > lastMs ? now : lastMs + 1;
  return new Date(lastMs).toISOString();
}

let idSeq = 0;

/**
 * A structurally valid v4 UUID whose first 8 hex chars are a counter, so id
 * order matches insertion order. Harmless at runtime, useful in tests.
 */
export function newId(): string {
  idSeq += 1;
  const head = idSeq.toString(16).padStart(8, '0');
  const tail = (idSeq + 0x1000).toString(16).padStart(12, '0').slice(-12);
  return `${head}-0000-4000-8000-${tail}`;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

type Tables = Record<DemoTable, Row[]>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seed(): Tables {
  return clone(SEED_TABLES) as unknown as Tables;
}

let tables: Tables = seed();

/** Tables whose rows carry a generated `id` primary key. */
const TABLES_WITH_ID: ReadonlySet<DemoTable> = new Set<DemoTable>([
  'users',
  'availability',
  'schedule_skips',
  'swaps',
  'trips',
  'conversations',
  'messages',
  'notifications',
  'reports',
]);

/**
 * Declared unique keys, enforced on plain `insert` only.
 *
 * `hooks/useCarpool.ts:272` treats code '23505' as "already skipped, fine" and
 * `hooks/useSwaps.ts:135` regexes the message for /duplicate|unique/, so both
 * the code and the wording matter.
 */
const UNIQUE_KEYS: Partial<
  Record<DemoTable, { cols: string[]; constraint: string; when?: (r: Row) => boolean }>
> = {
  availability: { cols: ['user_id', 'day_of_week'], constraint: 'availability_user_id_day_of_week_key' },
  schedule_skips: { cols: ['user_id', 'skip_date'], constraint: 'schedule_skips_user_id_skip_date_key' },
  trips: { cols: ['driver_id', 'ride_date'], constraint: 'trips_driver_id_ride_date_key' },
  trip_pickups: { cols: ['trip_id', 'rider_id'], constraint: 'trip_pickups_pkey' },
  blocks: { cols: ['blocker_id', 'blocked_id'], constraint: 'blocks_pkey' },
  // Partial index in the real schema: only OPEN requests are unique per day.
  swaps: { cols: ['requester_id', 'day'], constraint: 'swaps_open_unique', when: (r) => r.status === 'open' },
};

function applyDefaults(table: DemoTable, row: Row): Row {
  const out: Row = { ...row };
  if (TABLES_WITH_ID.has(table) && out.id === undefined) out.id = newId();

  switch (table) {
    case 'users':
      if (out.created_at === undefined) out.created_at = nowISO();
      if (out.updated_at === undefined) out.updated_at = nowISO();
      break;
    case 'availability':
      if (out.participating === undefined) out.participating = false;
      if (out.can_drive === undefined) out.can_drive = false;
      if (out.is_driving === undefined) out.is_driving = false;
      break;
    case 'schedule_skips':
      if (out.created_at === undefined) out.created_at = nowISO();
      break;
    case 'swaps':
      if (out.status === undefined) out.status = 'open';
      if (out.accepted_by === undefined) out.accepted_by = null;
      if (out.note === undefined) out.note = null;
      if (out.created_at === undefined) out.created_at = nowISO();
      break;
    case 'trips':
      if (out.status === undefined) out.status = 'on_my_way';
      if (out.rider_ids === undefined) out.rider_ids = [];
      if (out.started_at === undefined) out.started_at = nowISO();
      if (out.updated_at === undefined) out.updated_at = nowISO();
      break;
    case 'trip_pickups':
      if (out.picked_up_at === undefined) out.picked_up_at = nowISO();
      break;
    case 'conversations':
      if (out.ride_date === undefined) out.ride_date = null;
      if (out.title === undefined) out.title = null;
      if (out.created_at === undefined) out.created_at = nowISO();
      break;
    case 'conversation_participants':
      if (out.last_read_at === undefined) out.last_read_at = null;
      break;
    case 'messages':
      if (out.created_at === undefined) out.created_at = nowISO();
      break;
    case 'notifications':
      if (out.read_at === undefined) out.read_at = null;
      if (out.data === undefined) out.data = null;
      if (out.body === undefined) out.body = null;
      if (out.created_at === undefined) out.created_at = nowISO();
      break;
    case 'reports':
      if (out.created_at === undefined) out.created_at = nowISO();
      break;
    default:
      break;
  }
  return out;
}

function sameKey(a: Row, b: Row, cols: string[]): boolean {
  return cols.every((c) => a[c] === b[c]);
}

function uniqueViolation(constraint: string): DemoError {
  return {
    message: `duplicate key value violates unique constraint "${constraint}"`,
    details: null,
    hint: null,
    code: '23505',
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The stored rows for a table, ignoring both the availability generator and the
 * blocks RLS scope.
 *
 * Only the `community_blocked_pairs` RPC needs this: the real function is
 * SECURITY DEFINER and deliberately reports pairs community-wide, so scoping it
 * to the caller the way `readTable('blocks')` does would be wrong.
 */
export function readTableRaw(table: DemoTable): Row[] {
  return tables[table];
}

/**
 * Reads, post-generation and pre-filter.
 *
 * Two tables are special:
 *  - `availability` gets the three companion parents appended, generated from
 *    whatever the presenter has stored (§ companionAvailability below).
 *  - `blocks` is scoped to the session user, reproducing the `blocks_select_own`
 *    RLS policy. `lib/moderation.ts:72` selects with NO filter and relies on it;
 *    an unscoped read would let one member's block hide another member's
 *    messages in `hooks/useMessages.ts:225`.
 */
export function readTable(table: DemoTable): Row[] {
  if (table === 'availability') {
    return [...tables.availability, ...companionAvailability()];
  }
  if (table === 'blocks') {
    const uid = session?.user.id;
    return tables.blocks.filter((r) => r.blocker_id === uid);
  }
  // A copy, so a caller iterating a result cannot be tripped up by a concurrent
  // insert and cannot splice rows out of the store by accident.
  return [...tables[table]];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function insertRows(
  table: DemoTable,
  rows: Row[],
): { rows: Row[]; error: DemoError | null } {
  const key = UNIQUE_KEYS[table];
  const prepared = rows.map((r) => applyDefaults(table, r));

  if (key) {
    // Postgres aborts the whole statement on the first conflict, so validate
    // everything before mutating anything.
    const existing = tables[table];
    for (let i = 0; i < prepared.length; i += 1) {
      const candidate = prepared[i];
      if (key.when && !key.when(candidate)) continue;
      const clash =
        existing.some((e) => (!key.when || key.when(e)) && sameKey(e, candidate, key.cols)) ||
        prepared
          .slice(0, i)
          .some((e) => (!key.when || key.when(e)) && sameKey(e, candidate, key.cols));
      if (clash) return { rows: [], error: uniqueViolation(key.constraint) };
    }
  }

  tables[table].push(...prepared);
  for (const row of prepared) emit(table, 'INSERT', row, {});
  return { rows: prepared.map((r) => ({ ...r })), error: null };
}

export function updateRows(table: DemoTable, match: (r: Row) => boolean, patch: Row): Row[] {
  const affected: Row[] = [];
  const rows = tables[table];
  for (let i = 0; i < rows.length; i += 1) {
    if (!match(rows[i])) continue;
    const before = { ...rows[i] };
    rows[i] = { ...rows[i], ...patch };
    affected.push({ ...rows[i] });
    emit(table, 'UPDATE', rows[i], before);
  }
  return affected;
}

/**
 * PostgREST's `upsert`: merge on the conflict columns, insert when nothing
 * matches. It never raises 23505 — that is the whole point of the callers using
 * it (`useMySchedule.setDay`, `useTrip.startTrip`, `moderation.blockUser`).
 */
export function upsertRows(
  table: DemoTable,
  rows: Row[],
  onConflict?: string[],
): { rows: Row[]; error: DemoError | null } {
  const cols = onConflict?.length ? onConflict : UNIQUE_KEYS[table]?.cols;
  const out: Row[] = [];

  for (const incoming of rows) {
    const existingIndex = cols
      ? tables[table].findIndex((e) => sameKey(e, incoming, cols))
      : -1;

    if (existingIndex >= 0) {
      const before = { ...tables[table][existingIndex] };
      const merged = { ...before, ...incoming };
      tables[table][existingIndex] = merged;
      out.push({ ...merged });
      emit(table, 'UPDATE', merged, before);
    } else {
      const created = applyDefaults(table, incoming);
      tables[table].push(created);
      out.push({ ...created });
      emit(table, 'INSERT', created, {});
    }
  }

  return { rows: out, error: null };
}

export function deleteRows(table: DemoTable, match: (r: Row) => boolean): Row[] {
  const rows = tables[table];
  const removed: Row[] = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (!match(rows[i])) continue;
    const [row] = rows.splice(i, 1);
    removed.unshift(row);
  }
  for (const row of removed) emit(table, 'DELETE', {}, row);
  return removed.map((r) => ({ ...r }));
}

// ---------------------------------------------------------------------------
// Realtime — postgres_changes
// ---------------------------------------------------------------------------

interface ChangeSub {
  table: DemoTable;
  event: ChangeEvent | '*';
  filter?: string;
  cb: (payload: ChangePayload) => void;
}

let changeSubs: ChangeSub[] = [];

/**
 * Only three filter strings exist in the whole codebase and all are
 * `col=eq.value`. Anything else is treated as match-all rather than match-none:
 * a subscription that silently never fires is far harder to diagnose on stage
 * than one that fires too often.
 */
function filterMatches(filter: string | undefined, row: Row): boolean {
  if (!filter) return true;
  const m = /^([\w.]+)=eq\.(.*)$/.exec(filter);
  if (!m) {
    if (__DEV__) console.warn(`[demo] unsupported realtime filter "${filter}" — treating as match-all`);
    return true;
  }
  return String(row[m[1]]) === m[2];
}

function emit(table: DemoTable, eventType: ChangeEvent, next: Row, previous: Row): void {
  const payload: ChangePayload = {
    schema: 'public',
    table,
    commit_timestamp: nowISO(),
    eventType,
    new: eventType === 'DELETE' ? {} : { ...next },
    old: eventType === 'INSERT' ? {} : { ...previous },
    errors: null,
  };
  const subject = eventType === 'DELETE' ? payload.old : payload.new;

  for (const sub of changeSubs) {
    if (sub.table !== table) continue;
    if (sub.event !== '*' && sub.event !== eventType) continue;
    if (!filterMatches(sub.filter, subject)) continue;
    // Deferring one macrotask is REQUIRED, not cosmetic. Writes happen inside
    // React event handlers that are themselves mid-setState (useMessages sets an
    // optimistic bubble before awaiting its insert); a synchronous callback
    // would re-enter that handler's own state updates, and useCarpool's
    // debounced refetch would be scheduled from inside the write it is about to
    // observe. One macrotask mirrors a real network round-trip.
    setTimeout(() => sub.cb(payload), 0);
  }
}

export function subscribeChanges(
  table: DemoTable,
  event: ChangeEvent | '*',
  filter: string | undefined,
  cb: (payload: ChangePayload) => void,
): () => void {
  const sub: ChangeSub = { table, event, filter, cb };
  changeSubs.push(sub);
  return () => {
    changeSubs = changeSubs.filter((s) => s !== sub);
  };
}

// ---------------------------------------------------------------------------
// Realtime — broadcast
// ---------------------------------------------------------------------------

interface BroadcastSub {
  channel: string;
  event: string;
  cb: (msg: { payload: unknown }) => void;
}

let broadcastSubs: BroadcastSub[] = [];

export function subscribeBroadcast(
  channel: string,
  event: string,
  cb: (msg: { payload: unknown }) => void,
): () => void {
  const sub: BroadcastSub = { channel, event, cb };
  broadcastSubs.push(sub);
  return () => {
    broadcastSubs = broadcastSubs.filter((s) => s !== sub);
  };
}

export function sendBroadcast(channel: string, event: string, payload: unknown): void {
  for (const sub of broadcastSubs) {
    if (sub.channel !== channel || sub.event !== event) continue;
    setTimeout(() => sub.cb({ payload }), 0);
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

let session: DemoSession | null = null;
let authSubs: ((event: string, s: DemoSession | null) => void)[] = [];

/**
 * In-memory only, never written to `authStorage`. Every demo run must start at
 * the Welcome screen so the signup walkthrough is available, so a cold start has
 * no session by construction.
 */
export function getSession(): DemoSession | null {
  return session;
}

export function setSession(s: DemoSession | null): void {
  session = s;
  const event = s ? 'SIGNED_IN' : 'SIGNED_OUT';
  // Asynchronous on purpose: App.tsx's onAuthStateChange handler is the only
  // thing that navigates into the app, and calling it synchronously from inside
  // signInWithPassword would set state during the caller's own render/commit.
  for (const cb of [...authSubs]) setTimeout(() => cb(event, s), 0);
}

export function onAuthChange(cb: (event: string, s: DemoSession | null) => void): () => void {
  authSubs.push(cb);
  return () => {
    authSubs = authSubs.filter((c) => c !== cb);
  };
}

// ---------------------------------------------------------------------------
// The adaptive availability generator
// ---------------------------------------------------------------------------

const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/**
 * Minutes after the presenter's own pickup time. The spread is deliberately
 * under 30 so `lib/pairing.ts:168-171`'s sliding window always admits all four
 * cluster members: the anchor is the earliest (the presenter, at +0) and the
 * latest is +15.
 */
const OFFSETS: readonly (readonly [string, number])[] = [
  [MARCUS_ID, 0],
  [PRIYA_ID, 10],
  [JENNA_ID, 15],
];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  return h * 60 + m;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function addMinutes(hhmm: string, delta: number): string {
  // `mod 1440` is purely defensive — the reachable maximum is 18:00 + 15.
  const total = (minutesOf(hhmm) + delta + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/**
 * The other three cluster parents' availability, derived on every read from
 * whatever the presenter has stored.
 *
 * Why generate instead of seed: `lib/pairing.ts:168-171` clusters only members
 * within 30 minutes of the earliest in the zone, so any FIXED time for the fake
 * parents can strand the presenter outside the window once they pick a time on
 * stage. Deriving the companions from the presenter's own time makes the whole
 * community reshape around whatever is picked, and guarantees one car with
 * exactly three riders for all twelve values the clock can produce.
 *
 * Tom and Rachel deliberately get NO rows. A participating same-zone member with
 * a fixed time can become the window anchor and split the presenter out of the
 * cluster; having no rows makes that unreachable by construction. They exist only
 * for the swap board and the DM thread, neither of which reads availability.
 *
 * Generated rows must never carry PRESENTER_ID: `hooks/useMySchedule.ts:75`
 * filters `.eq('user_id', uid)`, so the Edit Schedule screen must see only the
 * presenter's own stored rows.
 */
export function companionAvailability(): Row[] {
  const out: Row[] = [];
  for (const day of WEEKDAYS) {
    const mine = tables.availability.find(
      (r) => r.user_id === PRESENTER_ID && r.day_of_week === day,
    );
    const participating = Boolean(mine?.participating);
    const storedTime = typeof mine?.dismissal_time === 'string' ? mine.dismissal_time : null;

    // `.slice(0,5)` mirrors useCarpool.ts:136, which reads the Postgres TIME as
    // 'HH:MM:SS' and truncates to 'HH:MM'.
    const base =
      participating && storedTime ? storedTime.slice(0, 5) : DEMO_FALLBACK_PICKUP;
    const presenterDrives = participating && Boolean(mine?.can_drive);

    for (const [uid, offset] of OFFSETS) {
      out.push({
        id: `${uid}-${day}`,
        user_id: uid,
        day_of_week: day,
        participating: true,
        dismissal_time: `${addMinutes(base, offset)}:00`,
        // Jenna volunteers only when the presenter does not. This is what makes
        // the driver deterministic: with both volunteering, `driveCount` is
        // cumulative across the season (lib/pairing.ts:242) and the two of them
        // alternate day by day, so who drives "the next school day" becomes a
        // coin flip that reads as a bug on stage. Coupling the two collapses the
        // candidate set to a singleton in both directions.
        can_drive: uid === JENNA_ID ? !presenterDrives : false,
        role: 'ride',
        is_driving: false,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Test support
// ---------------------------------------------------------------------------

/** Re-seed from SEED_TABLES and drop every subscription. Dev/test only. */
export function __resetStore(): void {
  tables = seed();
  changeSubs = [];
  broadcastSubs = [];
  authSubs = [];
  session = null;
  idSeq = 0;
  lastMs = 0;
}
