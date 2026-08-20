# Demo mode — implementation contract

Companion to the approved plan (`~/.claude/plans/streamed-singing-hummingbird.md`).
The plan states *intent*; this document states the *contracts*. A coding agent
should be able to implement `lib/demo/**` from this file without making a design
decision. Everything here was verified against the working tree at `a70f435`.

**Design axiom.** The interception seam is `lib/supabase.ts`. Every hook, query
string, realtime handler and screen runs its real production code path against a
fake client. Nothing in `hooks/`, `lib/pairing.ts` or `lib/schoolCalendar.ts`
learns that the demo exists.

---

## 0. The flag, and the one line that switches the app

`DEMO_MODE` is declared exactly once, at `lib/demoMode.ts:30`:

```ts
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
```

It **must** stay a full static member expression. `babel-preset-expo` inlines
`EXPO_PUBLIC_*` only in that form; destructuring `process.env` defeats the
inliner and leaks the flag name into a production bundle.

`lib/supabase.ts` currently builds the client at lines 12–21 and registers an
`AppState` listener at lines 23–29. The demo change is:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_MODE } from '@/lib/demoMode';
import { createDemoClient } from '@/lib/demo/client';
import { startDemoScript } from '@/lib/demo/script';

export const supabase: SupabaseClient = DEMO_MODE
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { /* unchanged */ });

if (DEMO_MODE) startDemoScript();
```

Constraints on that edit:

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` **must keep being exported** — `lib/mapHtml.ts:1`
  imports both.
- `mapSupabaseError` (`lib/supabase.ts:31-64`) is untouched. It only reads
  `error.message`, so the fake error shapes below flow through it correctly.
- The `AppState` listener stays **unguarded**. The fake `auth` implements
  `startAutoRefresh` / `stopAutoRefresh` as no-ops (see §3.6). Guarding the
  listener instead would work but adds a second conditional for no benefit.
- The static `import` of `client.ts` / `script.ts` is fine: Metro does not
  tree-shake, but with the flag unset `DEMO_MODE` folds to the literal `false`
  and neither `createDemoClient()` nor `startDemoScript()` is ever called.

New constants to add to `lib/demoMode.ts` (all demo timing lives in one file):

```ts
/** Pickup time the fake community falls back to when you have not set a day. */
export const DEMO_FALLBACK_PICKUP = '15:15';   // matches EditScheduleScreen's DEFAULT_TIME
export const DEMO_BOT_THINK_MS = 900;          // silence before the ••• appears
export const DEMO_BOT_TYPING_MS = 1_200;       // how long ••• shows before the reply lands
export const DEMO_BOT_FOLLOWUP_MS = 2_400;     // gap before an optional second bot line
export const DEMO_AMBIENT_SWAP_MS = 45_000;    // "Rachel needs cover" beat, after sign-in
export const DEMO_AMBIENT_TRIP_DONE_MS = 1_500;// "Trip complete" beat, after demo arrival
```

The header comment at `lib/demoMode.ts:1-29` documents the old map-only demo and
the `npm run demo` invocation; update it, keeping the two paragraphs about the
static member expression and the Metro transform-cache hazard verbatim — both
are still true and both are load-bearing.

---

## 1. Module boundary table

Four new modules. The import rules exist to keep the graph acyclic:
`supabase.ts → {client, script} → store → fixtures`.

### 1.1 `lib/demo/fixtures.ts` — pure data, no behaviour

May import: `@/lib/demoRouteData`, `@/types`. **May not import** `store`,
`client`, `script`, `@/lib/supabase`, or anything from `hooks/`.

```ts
export const PRESENTER_ID: string;
export const MARCUS_ID: string;
export const PRIYA_ID: string;
export const JENNA_ID: string;
export const TOM_ID: string;
export const RACHEL_ID: string;

/** The four ids that form the daily cluster, presenter first. */
export const CLUSTER_IDS: readonly string[];

export interface DemoUserRow {
  id: string;
  full_name: string;
  child_name: string;
  grade: string;
  neighborhood: string;
  email: string;
  address: string;
  latitude: number;
  longitude: number;
  car_capacity: number;
  car_color: string | null;
  car_type: string | null;
  car_model: string | null;
  license_plate: string | null;
  created_at: string;
  updated_at: string;
}

export const DEMO_USERS: DemoUserRow[];

/** Everything the store loads at construction, keyed by table name. */
export const SEED_TABLES: {
  users: DemoUserRow[];
  availability: Record<string, unknown>[];        // [] — see §6
  schedule_skips: Record<string, unknown>[];      // []
  swaps: Record<string, unknown>[];               // Rachel's open Thursday request
  trips: Record<string, unknown>[];               // 6 completed, for the impact strip
  trip_pickups: Record<string, unknown>[];        // []
  conversations: Record<string, unknown>[];       // 1 group + 1 DM with Tom
  conversation_participants: Record<string, unknown>[];
  messages: Record<string, unknown>[];            // prior history for both threads
  notifications: Record<string, unknown>[];       // 2, one unread
  blocks: Record<string, unknown>[];              // []
  reports: Record<string, unknown>[];             // []
};

/** Prefill for SignupScreen / LoginScreen (§9). */
export const DEMO_SIGNUP_PREFILL: {
  fullName: string; childName: string; grade: string; neighborhood: string;
  address: string; coords: { lat: number; lng: number };
  carCapacity: string; carColor: string; carType: string;
  carState: string; licensePlate: string;
  rejectedEmail: string;   // 'robert.calder@gmail.com'
  acceptedEmail: string;   // 'robert.calder@district.school.edu'
  password: string;        // 'ridrdemo'
};

/** Domain the demo signup gate accepts. */
export const DEMO_SCHOOL_EMAIL_DOMAIN: string; // 'district.school.edu'
```

### 1.2 `lib/demo/store.ts` — tables, filters, pub/sub

May import: `@/lib/demo/fixtures`, `@/lib/demoMode`, `@/types`. **May not
import** `client`, `script`, `@/lib/supabase`.

```ts
export type Row = Record<string, unknown>;

export type DemoTable =
  | 'users' | 'availability' | 'schedule_skips' | 'swaps'
  | 'trips' | 'trip_pickups'
  | 'conversations' | 'conversation_participants' | 'messages'
  | 'notifications' | 'blocks' | 'reports';

export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ChangePayload {
  schema: 'public';
  table: DemoTable;
  commit_timestamp: string;
  eventType: ChangeEvent;
  new: Row;          // {} on DELETE
  old: Row;          // {} on INSERT
  errors: null;
}

export interface DemoSession {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: number;
  user: { id: string; email: string; aud: 'authenticated'; role: 'authenticated';
          app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>;
          created_at: string };
}

/** Reads (post-generation, pre-filter). Never returns the internal array. */
export function readTable(table: DemoTable): Row[];

/** Writes. Each returns the affected rows and emits the matching change event. */
export function insertRows(table: DemoTable, rows: Row[]): { rows: Row[]; error: DemoError | null };
export function updateRows(table: DemoTable, match: (r: Row) => boolean, patch: Row): Row[];
export function upsertRows(table: DemoTable, rows: Row[], onConflict?: string[]): { rows: Row[]; error: DemoError | null };
export function deleteRows(table: DemoTable, match: (r: Row) => boolean): Row[];

export interface DemoError { message: string; details: string | null; hint: string | null; code: string }

/** Realtime. `filter` is a PostgREST filter string, e.g. 'user_id=eq.<uuid>'. */
export function subscribeChanges(
  table: DemoTable,
  event: ChangeEvent | '*',
  filter: string | undefined,
  cb: (payload: ChangePayload) => void,
): () => void;

/** Broadcast channels (live-location). Name-keyed, ephemeral. */
export function subscribeBroadcast(channel: string, event: string, cb: (msg: { payload: unknown }) => void): () => void;
export function sendBroadcast(channel: string, event: string, payload: unknown): void;

/** Session. In-memory only — never persisted (see §3.6). */
export function getSession(): DemoSession | null;
export function setSession(s: DemoSession | null): void;
export function onAuthChange(cb: (event: string, s: DemoSession | null) => void): () => void;

/** Monotonic ISO timestamp — never returns the same value twice. */
export function nowISO(): string;
export function newId(): string;
```

### 1.3 `lib/demo/client.ts` — the fake supabase-js

May import: `@/lib/demo/store`, `@/lib/demo/fixtures`, `@/lib/demoMode`.
**May not import** `@/lib/supabase` (would cycle) or `script`.

```ts
export function createDemoClient(): unknown;
```

Returns an object structurally compatible with the parts of `SupabaseClient`
the app touches: `{ from, rpc, auth, functions, channel, removeChannel }`.
`unknown` is deliberate — typing it as `SupabaseClient` would require
reproducing the generic `PostgrestQueryBuilder` chain; the single
`as unknown as SupabaseClient` cast lives in `lib/supabase.ts`.

### 1.4 `lib/demo/script.ts` — bot replies, ambient beats, typing indicator

May import: `@/lib/demo/store`, `@/lib/demo/fixtures`, `@/lib/demoMode`,
`expo-notifications`. **May not import** `client` or `@/lib/supabase`.

```ts
/** Arms the bot + ambient beats. Idempotent; called once from lib/supabase.ts. */
export function startDemoScript(): void;

/** ConversationScreen subscribes for the ••• footer row. Returns an unsubscribe. */
export function onDemoTyping(conversationId: string, cb: (typing: boolean) => void): () => void;
```

---

## 2. The complete data surface

This is the fake client's acceptance criteria. If any row here is unimplemented,
the demo silently renders an empty screen instead of erroring.

### 2.1 Tables — 12

| Table | Callsite | Operation | Columns the app actually touches |
|---|---|---|---|
| `users` | `hooks/useCurrentUser.ts:34-38` | `select('*').eq('id',uid).single()` | all of `UserProfile` (`types/index.ts:75-92`) |
| | `hooks/useMessages.ts:83-87` | `select('full_name').eq('id',userId).single()` | `full_name` |
| | `screens/LiveTripScreen.tsx:109-113` | `select('id, full_name, child_name, latitude, longitude').in('id',ids)` | those 5 |
| | `screens/profile/EditProfileScreen.tsx:101-111` | `update({full_name,child_name,address,latitude,longitude,car_capacity}).eq('id',uid)` | those 6 |
| | *(embed target)* | — | `full_name, neighborhood, car_capacity, car_color, car_type, car_model, license_plate, address, id` |
| `availability` | `hooks/useCarpool.ts:89-96` | `select(<embed A>).eq('participating',true)` | `user_id, day_of_week, dismissal_time, can_drive, participating` |
| | `hooks/useMySchedule.ts:72-75` | `select('day_of_week, participating, dismissal_time, can_drive').eq('user_id',uid)` | same |
| | `hooks/useMySchedule.ts:130-141` | `upsert({user_id,day_of_week,participating,dismissal_time,can_drive,role,is_driving},{onConflict:'user_id,day_of_week'})` | + `role`, `is_driving` |
| `schedule_skips` | `hooks/useCarpool.ts:97` | `select('user_id, skip_date')` — **no filter** | `user_id, skip_date` |
| | `hooks/useCarpool.ts:267-269` | `insert({user_id,skip_date})` | |
| | `hooks/useCarpool.ts:292-296` | `delete().eq('user_id',x).eq('skip_date',iso)` | |
| `swaps` | `hooks/useCarpool.ts:98-101` | `select('requester_id, accepted_by, day, status').eq('status','filled')` | those 4 |
| | `hooks/useSwaps.ts:75-82` | `select(<embed B>).or('status.eq.open,requester_id.eq.<uid>').order('day',{ascending:true})` | `id, requester_id, day, note, status, accepted_by` |
| | `hooks/useSwaps.ts:125-132` | `insert({requester_id,day,note,status:'open'})` | |
| | `hooks/useSwaps.ts:156-160` | `update({status:'cancelled'}).eq('id',id).eq('requester_id',uid)` | |
| `trips` | `hooks/useTrip.ts:43-48` | `select('*').eq('driver_id',d).eq('ride_date',iso).maybeSingle()` | all of `Trip` (`types/index.ts:168-176`) |
| | `hooks/useTrip.ts:117-130` | `upsert({driver_id,ride_date,rider_ids,status,updated_at},{onConflict:'driver_id,ride_date'}).select('*').single()` | |
| | `hooks/useTrip.ts:157-160` | `update({status,updated_at}).eq('id',id)` | |
| | `lib/geofenceTask.ts:99-108` | same upsert (background task) | |
| | `lib/geofenceTask.ts:115-120` | `update({status,updated_at}).eq('driver_id',d).eq('ride_date',iso).eq('status','on_my_way')` | |
| `trip_pickups` | `hooks/useTrip.ts:56-59` | `select('rider_id').eq('trip_id',id)` | `trip_id, rider_id, picked_up_at` |
| | `hooks/useTrip.ts:208-210` | `insert({trip_id,rider_id})` | |
| | `hooks/useTrip.ts:197-201` | `delete().eq('trip_id',t).eq('rider_id',r)` | |
| `conversations` | `screens/messages/ConversationScreen.tsx:87-92` | `select('type').eq('id',id).single()` | `id, type, ride_date, title, created_at` (`types/index.ts:134-140`) |
| | *(embed target)* | — | all five |
| `conversation_participants` | `hooks/useConversations.ts:61-67` | `select(<embed C>).eq('user_id',uid)` | `conversation_id, user_id, last_read_at` |
| | `hooks/useConversations.ts:91-97` | `select(<embed D>).in('conversation_id',ids)` | |
| | `screens/messages/ConversationScreen.tsx:107-111` | `update({last_read_at}).eq('conversation_id',c).eq('user_id',u)` | |
| `messages` | `hooks/useMessages.ts:102-109` | `select(<embed E>).eq('conversation_id',c).order('created_at',{ascending:true})` | `id, conversation_id, sender_id, content, created_at` |
| | `hooks/useConversations.ts:98-102` | `select('id, conversation_id, sender_id, content, created_at').in('conversation_id',ids).order('created_at',{ascending:false})` | |
| | `hooks/useMessages.ts:193-201` | `insert({conversation_id,sender_id,content}).select('id, conversation_id, sender_id, content, created_at').single()` | |
| `notifications` | `hooks/useNotifications.ts:38-43` | `select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(100)` | all of `AppNotification` (`types/index.ts:198-207`) |
| | `hooks/useNotifications.ts:84-88` | `update({read_at}).eq('user_id',uid).is('read_at',null)` | |
| `blocks` | `lib/moderation.ts:42-44` | `upsert({blocker_id,blocked_id},{onConflict:'blocker_id,blocked_id'})` | `blocker_id, blocked_id` |
| | `lib/moderation.ts:57-61` | `delete().eq('blocker_id',b).eq('blocked_id',x)` | |
| | `lib/moderation.ts:72` | `select('blocked_id')` — **no filter, relies on RLS** | see §3.5 |
| `reports` | `lib/moderation.ts:22-28` | `insert({reporter_id,reported_user_id,conversation_id,message_id,reason})` | those 5 |

`rides` and `hardship_passes` appear only in `__tests__/` — no app code touches
them, so the store does not model them.

### 2.2 The five embedded joins — exact strings

There are exactly five `!`-constraint embeds in the codebase
(`grep -rn '!' --include='*.ts*' | grep '\.select('`). Each is **many-to-one**,
so the hydrated value is a single object or `null` — confirmed by every consumer
(`useCarpool.ts:131` guards `!row.user`; `useMessages.ts:119` reads
`r.sender?.full_name`; `useConversations.ts:80` reads `row.conversation`;
`useConversations.ts:113` reads `row.user`; `useSwaps.ts:45` reads
`r.requester?.full_name`).

**Embed A — `hooks/useCarpool.ts:91-95`**

```
'user_id, day_of_week, dismissal_time, can_drive,' +
' user:users!availability_user_id_fkey(full_name,neighborhood,car_capacity,' +
'car_color,car_type,car_model,license_plate,address)'
```
alias `user` · target `users` · FK `availability.user_id → users.id`

**Embed B — `hooks/useSwaps.ts:78-79`**

```
'id, requester_id, day, note, status, accepted_by,' +
' requester:users!swaps_requester_id_fkey(full_name, neighborhood)'
```
alias `requester` · target `users` · FK `swaps.requester_id → users.id`

**Embed C — `hooks/useConversations.ts:64-66`**

```
'conversation_id, last_read_at,' +
' conversation:conversations!conversation_participants_conversation_id_fkey(*)'
```
alias `conversation` · target `conversations` · FK `conversation_participants.conversation_id → conversations.id`

**Embed D — `hooks/useConversations.ts:94-96`**

```
'conversation_id,' +
' user:users!conversation_participants_user_id_fkey(id, full_name)'
```
alias `user` · target `users` · FK `conversation_participants.user_id → users.id`

**Embed E — `hooks/useMessages.ts:105-106`**

```
'id, conversation_id, sender_id, content, created_at,' +
' sender:users!messages_sender_id_fkey(full_name)'
```
alias `sender` · target `users` · FK `messages.sender_id → users.id`

The resolver is a static table keyed by constraint name — do **not** try to
infer the FK from the alias:

```ts
const FK_BY_CONSTRAINT: Record<string, { table: DemoTable; column: string; target: DemoTable }> = {
  availability_user_id_fkey:                          { table: 'availability',              column: 'user_id',         target: 'users' },
  swaps_requester_id_fkey:                            { table: 'swaps',                     column: 'requester_id',    target: 'users' },
  conversation_participants_conversation_id_fkey:     { table: 'conversation_participants', column: 'conversation_id', target: 'conversations' },
  conversation_participants_user_id_fkey:             { table: 'conversation_participants', column: 'user_id',         target: 'users' },
  messages_sender_id_fkey:                            { table: 'messages',                  column: 'sender_id',       target: 'users' },
};
```

### 2.3 RPCs — 7

| RPC | Callsite | Args | Real return | Demo behaviour |
|---|---|---|---|---|
| `community_blocked_pairs` | `hooks/useCarpool.ts:104` | none | `{user_a,user_b}[]` (`supabase/migrations/20260629120200_community_blocked_pairs.sql:11-24`) | `SELECT DISTINCT least/greatest` over the store's `blocks` — implement literally |
| `accept_swap` | `hooks/useSwaps.ts:178-180` | `{p_swap_id}` | void | set `status:'filled'`, `accepted_by: session.user.id` on that swap **iff** it is `open` and the caller's `car_capacity >= 1`; else return `{ message: 'you need a car to cover a drive', code: 'P0001' }` (the hook regexes `/car/i` at `useSwaps.ts:185`) |
| `register_push_token` | `hooks/usePushRegistration.ts:62-65` | `{p_token,p_platform}` | void | `{ data: null, error: null }` — unreachable in demo (§10) but must not throw |
| `get_or_create_dm` | `lib/conversationUtils.ts:31-33` | `{other_user_id}` | `uuid` **string** | find the `type:'dm'` conversation whose participant set is exactly `{caller, other}`; else create conversation + both participant rows. Must return a plain string — `conversationUtils.ts:34` rejects anything else |
| `get_or_create_group` | `lib/conversationUtils.ts:55-59` | `{p_ride_date,p_participant_ids,p_title}` | `uuid` **string** | find the `type:'group'` conversation with that `ride_date`; else create with `title: p_title`. Then idempotently add any missing participant rows |
| `validate_invite_code` | `screens/auth/SignupScreen.tsx:170-173` | `{p_code}` | `boolean` | `true` (the demo removes the field, but the call must not 404) |
| `email_exists` | `screens/auth/SignupScreen.tsx:193-196` | `{p_email}` | `boolean` | `false` |

Unknown RPC name → `{ data: null, error: { message: 'function public.<name> does not exist', code: 'PGRST202', details: null, hint: null } }`, and a `console.warn` in `__DEV__`.

### 2.4 Edge functions — 2

| Function | Callsite | Body | Demo behaviour |
|---|---|---|---|
| `create-account` | `lib/account.ts:16-18` | `{ email, password, data }` | merge the whitelisted keys of `data` (`full_name, child_name, grade, neighborhood, address, latitude, longitude, car_capacity, car_color, car_type, license_plate` — `SignupScreen.tsx:230-243`) into the **existing** presenter `users` row, coercing `latitude`/`longitude`/`car_capacity` from string to number. **Do not clear `car_model`** — the signup form has no model field (`SignupFormValues`, `types/index.ts:94-110`), so the fixture value must survive. Return `{ data: { ok: true }, error: null }` |
| `delete-account` | `lib/account.ts:46-48` | `{}` | `{ data: { ok: true }, error: null }` and clear the session |

Unknown function name → `{ data: null, error: { message: 'Function not found' } }`.

### 2.5 Realtime channels — 7

Six `postgres_changes` channels and one broadcast channel.

| Channel name | Callsite | Subscriptions |
|---|---|---|
| `carpool-${n}` | `hooks/useCarpool.ts:208-230` | `*` on `availability`, `schedule_skips`, `swaps`, `blocks` — no filters |
| `swaps-${n}` | `hooks/useSwaps.ts:106-113` | `*` on `swaps` |
| `trip-${n}` | `hooks/useTrip.ts:84-101` | `*` on `trips` filter `driver_id=eq.<uuid>`; `*` on `trip_pickups` |
| `conversations-${n}` | `hooks/useConversations.ts:168-180` | `INSERT` on `messages`; `*` on `conversation_participants` |
| `messages-${conversationId}-${n}` | `hooks/useMessages.ts:144-163` | `INSERT` on `messages` filter `conversation_id=eq.<uuid>` |
| `notifications-${n}` | `hooks/useNotifications.ts:62-74` | `*` on `notifications` filter `user_id=eq.<uuid>` |
| `trip-loc-${driverId}-${iso}` | `hooks/useLiveDriverLocation.ts:25-34`, `lib/locationTask.ts:30-31,68`, `lib/mapHtml.ts:143-160` | `broadcast` event `'loc'` |

`lib/liveTrip.ts:19-21` builds the broadcast name. In demo, `useLocationSharing`
is disabled (§10) so nothing ever sends on it; the map is driven by
`useDemoDriverLocation`. The fake `channel()` must still accept `.on('broadcast', …)`
without throwing (`useLiveDriverLocation` subscribes unconditionally whenever
`channelName !== 'noop'`).

Only **three** filter strings occur in the whole codebase, all of the form
`col=eq.value`. The parser handles that form and treats anything else as
match-all with a `__DEV__` warning.

---

## 3. The fake query-builder contract

`from(table)` returns a fresh builder. Nothing executes until a *terminal* is
reached; all filters accumulate first.

### 3.1 Chainable methods

| Method | Signature | Effect |
|---|---|---|
| `select(cols?, opts?)` | `(string?, {count?,head?}?) => Builder` | records `cols`; if no verb has been set, the verb is `select`; after `insert`/`update`/`upsert`/`delete` it marks "return the affected rows" |
| `insert(values)` | `(Row \| Row[]) => Builder` | verb `insert` |
| `update(values)` | `(Row) => Builder` | verb `update` |
| `upsert(values, opts?)` | `(Row \| Row[], {onConflict?: string}?) => Builder` | verb `upsert`; `onConflict` is a comma-separated column list |
| `delete()` | `() => Builder` | verb `delete` |
| `eq(col, value)` | | predicate `r[col] === value` (loose for number/string id mixing: compare `String(r[col]) === String(value)` only when one side is a number) |
| `neq(col, value)` | | `r[col] !== value` |
| `in(col, values)` | `(string, unknown[]) => Builder` | `values.includes(r[col])`; empty array ⇒ no rows |
| `is(col, value)` | `(string, null \| boolean) => Builder` | `r[col] === value` (used only as `.is('read_at', null)`) |
| `or(filterString)` | `(string) => Builder` | see §3.4 |
| `order(col, opts?)` | `(string, {ascending?: boolean}?) => Builder` | stable sort; `ascending` defaults to `true` |
| `limit(n)` | `(number) => Builder` | slice after ordering |

`neq` is not currently called by app code but is cheap and is in the mock
blueprint (`__mocks__/supabaseMockFactory.ts:116`); include it.

### 3.2 Terminals

| Terminal | Returns |
|---|---|
| `then(onFulfilled, onRejected?)` | executes and resolves `{ data, error, count: null, status, statusText }` |
| `single()` | `Promise<{data, error}>` — exactly one row, else `PGRST116` |
| `maybeSingle()` | `Promise<{data, error}>` — zero rows ⇒ `{ data: null, error: null }` |

The builder is a **thenable**, not a Promise: it exposes only `then`. That is
what makes `await supabase.from('x').select('*')` work
(`__mocks__/supabaseMockFactory.ts:145-147` proves the shape). Do not add
`catch`/`finally` — nothing in the app calls them on a builder, and adding them
risks double execution.

Execution must be **idempotent per builder**: memoize the result on first
execution so `await` after `.single()` cannot re-run a write.

### 3.3 Result shapes per verb

```
select              → { data: Row[],  error: null, count: null, status: 200, statusText: 'OK' }
select + single     → { data: Row,    error: null, ... }  |  PGRST116 (see below)
select + maybeSingle→ { data: Row|null, error: null, ... }
insert (no select)  → { data: null,   error: null, status: 201, statusText: 'Created' }
insert + select     → { data: Row[],  error: null }        (array of inserted rows)
insert + select + single → { data: Row, error: null }
update (no select)  → { data: null,   error: null, status: 204, statusText: 'No Content' }
upsert (no select)  → { data: null,   error: null, status: 201 }
upsert + select + single → { data: Row, error: null }
delete (no select)  → { data: null,   error: null, status: 204 }
```

`data: null` on a write with no `.select()` matches PostgREST's default
`Prefer: return=minimal`. Every write callsite that omits `.select()` reads only
`error` — verified at `useCarpool.ts:267,292`, `useTrip.ts:157,197,208`,
`useSwaps.ts:125,156`, `useMySchedule.ts:130`, `useNotifications.ts:84`,
`moderation.ts:22,42,57`, `EditProfileScreen.tsx:101`, `ConversationScreen.tsx:107`.

**`.single()` with zero rows** — the exact PostgREST shape:

```ts
{
  data: null,
  error: {
    message: 'JSON object requested, multiple (or no) rows returned',
    details: 'The result contains 0 rows',
    hint: null,
    code: 'PGRST116',
  },
  count: null, status: 406, statusText: 'Not Acceptable',
}
```

With N > 1 rows the same object, `details: 'The result contains N rows'`.

**Unique violation** — required by `useCarpool.ts:272` (`insErr.code !== '23505'`)
and `useSwaps.ts:135` (`/duplicate|unique/i.test(iErr.message)`):

```ts
{
  data: null,
  error: {
    message: 'duplicate key value violates unique constraint "<constraint>"',
    details: null, hint: null, code: '23505',
  },
}
```

Declared unique keys the store must enforce on plain `insert`:

| Table | Key | Constraint name to report |
|---|---|---|
| `availability` | `(user_id, day_of_week)` | `availability_user_id_day_of_week_key` |
| `schedule_skips` | `(user_id, skip_date)` | `schedule_skips_user_id_skip_date_key` |
| `trips` | `(driver_id, ride_date)` | `trips_driver_id_ride_date_key` |
| `trip_pickups` | `(trip_id, rider_id)` | `trip_pickups_pkey` |
| `blocks` | `(blocker_id, blocked_id)` | `blocks_pkey` |
| `swaps` | `(requester_id, day)` **where `status = 'open'`** | `swaps_open_unique` |

`upsert` never raises 23505: it merges (`{ ...existing, ...incoming }`) on the
`onConflict` columns, falling back to the table's declared key when `onConflict`
is absent, and inserts when nothing matches. Upsert emits `UPDATE` when it
merged and `INSERT` when it created.

### 3.4 `.or()` parsing

One callsite, `hooks/useSwaps.ts:81`:

```ts
.or(`status.eq.open,requester_id.eq.${uid}`)
```

Rule: split the string on top-level commas (none of these contain parentheses),
parse each term as `column.op.value`, support `op ∈ {eq, neq, is}`, and OR the
term predicates together. The resulting predicate is ANDed with any other
filters on the builder. Values are raw strings; compare with the same loose rule
as `.eq`. A term that fails to parse ⇒ treat the whole `.or()` as match-all and
`console.warn` in `__DEV__` — silently returning nothing would blank the swap
board with no clue why.

### 3.5 Column-list handling

**The column list in `.select()` is ignored.** Return the full stored row.
Returning extra fields is harmless: every consumer reads named properties, and
the two places that cast (`useTrip.ts:136` `data as Trip`, `useCurrentUser.ts:45`
`data as UserProfile`) are structural casts, not runtime validation.

The **one** thing that is parsed out of the select string is the embed spec:

1. Split the select string on commas that are at paren-depth 0.
2. Trim each term.
3. A term matching `/^(\w+):(\w+)!(\w+)\((.*)\)$/` is an embed:
   `[, alias, targetTable, constraintName, innerCols]`.
4. Look `constraintName` up in `FK_BY_CONSTRAINT` (§2.2). If it is absent,
   throw at module load in `__DEV__` — an unmapped embed is the single most
   likely cause of a silently empty screen.
5. For each result row, set `row[alias] = readTable(target).find(t => t.id === row[fkColumn]) ?? null`.
   `innerCols` is discarded (full target row returned).
6. All other terms are ignored.

Every embed target is keyed on `id`; no other join key exists in the codebase.

Embeds are hydrated **after** filtering and ordering, on a shallow copy of each
row, so the store's arrays never gain the alias key.

### 3.6 `auth`, `functions`, `channel`

```ts
auth: {
  getSession():  Promise<{ data: { session: DemoSession | null }, error: null }>;
  getUser():     Promise<{ data: { user: DemoSession['user'] | null }, error: null }>;
  signInWithPassword({ email, password }): Promise<{ data: { user, session }, error: null }>;
  signOut():     Promise<{ error: null }>;
  onAuthStateChange(cb): { data: { subscription: { unsubscribe(): void } } };
  startAutoRefresh(): void;   // no-op
  stopAutoRefresh():  void;   // no-op
}
```

- `signInWithPassword` **always succeeds** and produces the session for
  `PRESENTER_ID` regardless of the email/password typed. The demo's rejection of
  the personal email happens in `SignupScreen`'s own validation (§9), not here.
- `onAuthStateChange` must fire `('SIGNED_IN', session)` asynchronously after
  `setSession`, because `App.tsx:147-149` is the only thing that navigates into
  the app.
- `App.tsx:156` gates on `session !== null` only — it never validates the JWT —
  so `access_token: 'demo'` is sufficient.
- **The session is in-memory only, never written to `authStorage`.** Reason:
  every `npm run demo` must start at the Welcome screen so the signup
  walkthrough (plan step 1) is available. `getSession()` therefore returns
  `{ data: { session: null } }` on a cold start.

`functions.invoke(name, { body })` → see §2.4.

`channel(name)` returns:

```ts
{
  on(type: 'postgres_changes' | 'broadcast', opts, cb): this;
  subscribe(cb?): this;
  send({ type, event, payload }): Promise<'ok'>;
  unsubscribe(): Promise<'ok'>;
}
```

`.on()` records the subscription; `.subscribe()` activates all recorded ones and
invokes `cb?.('SUBSCRIBED')` asynchronously. `removeChannel(ch)` tears down every
subscription the channel holds and resolves `'ok'` — it is `void`-ed in eight
cleanup paths, so it must never reject.

---

## 4. The store and its pub/sub

### 4.1 Storage

```ts
const tables: Record<DemoTable, Row[]>;   // deep-cloned from fixtures.SEED_TABLES at module load
```

Plain arrays of plain objects. No indexes — the largest table is `messages`
(order 20 rows) and the pairing engine's own walk dominates any cost.

`readTable(t)` returns `tables[t]` for eleven tables, and for `'availability'`
returns `[...tables.availability, ...generateCompanionAvailability()]` (§6).

Auto-populated columns on `insert`/`upsert`-insert:

| Table | Defaults applied when absent |
|---|---|
| all | `id: newId()` where the table has an `id` column |
| `users` | `created_at`, `updated_at` |
| `availability` | `participating: false`, `can_drive: false`, `is_driving: false` |
| `schedule_skips` | `created_at` |
| `swaps` | `status: 'open'`, `accepted_by: null`, `note: null`, `created_at` |
| `trips` | `status: 'on_my_way'`, `rider_ids: []`, `started_at: nowISO()`, `updated_at: nowISO()` |
| `trip_pickups` | `picked_up_at: nowISO()` |
| `conversations` | `ride_date: null`, `title: null`, `created_at` |
| `conversation_participants` | `last_read_at: null` |
| `messages` | `created_at: nowISO()` |
| `notifications` | `read_at: null`, `data: null`, `body: null`, `created_at` |
| `reports` | `created_at` |

`nowISO()` is **monotonic**: it tracks the last value returned and adds 1 ms if
the wall clock has not advanced. Without this, the presenter's message and the
bot's reply can share a `created_at`, and `useMessages.ts:43-46` sorts by
`created_at` alone, so the reply can render *above* the question.

`newId()` returns a v4-shaped UUID whose first 8 hex chars are a monotonically
increasing counter, so id order matches insertion order (useful in tests, and
harmless at runtime).

### 4.2 RLS emulation — one case only

`lib/moderation.ts:72` reads `supabase.from('blocks').select('blocked_id')` with
no filter, relying on the real `blocks` SELECT policy to scope rows to the
caller. The store must reproduce that: `readTable('blocks')` returns only rows
where `blocker_id === getSession()?.user.id`. No other table depends on RLS for
correctness — every other unfiltered read (`schedule_skips`,
`community_blocked_pairs`) is community-wide by design.

### 4.3 Change notification

Every mutating store function ends with, for each affected row:

```ts
emit({
  schema: 'public',
  table,
  commit_timestamp: nowISO(),
  eventType,                 // 'INSERT' | 'UPDATE' | 'DELETE'
  new: eventType === 'DELETE' ? {} : { ...row },
  old: eventType === 'INSERT' ? {} : { ...previousRow },
  errors: null,
});
```

`emit` walks the subscription list, keeps those whose `table` matches and whose
`event` is `'*'` or equal to `eventType` and whose `filter` (if present) matches
the payload's `new` row (or `old` on DELETE), and dispatches each callback via
`setTimeout(fn, 0)`.

**The `setTimeout` is required, not cosmetic.** Writes happen inside React event
handlers that also call `setState` (e.g. `useMessages.sendMessage` at
`useMessages.ts:189` sets an optimistic message *before* awaiting the insert). A
synchronous callback would re-enter `setMessages` from inside the same handler,
and `useCarpool`'s debounced refetch would be scheduled from inside a write it
is about to observe. Deferring one macrotask mirrors a real network round-trip.

### 4.4 Payload shape — verified against every consumer

`ChangePayload` was derived by reading all six `postgres_changes` handlers:

| Handler | What it destructures |
|---|---|
| `hooks/useMessages.ts:154-155` | **`payload.new`**, cast to `Message`. Reads `.sender_id` (line 157) and spreads the whole row into state (line 159) — so `new` must carry `id, conversation_id, sender_id, content, created_at` |
| `hooks/useCarpool.ts:210-229` | ignores the payload entirely (`scheduleRefetch` takes no argument) |
| `hooks/useSwaps.ts:108-112` | ignores it |
| `hooks/useTrip.ts:86-100` | ignores it |
| `hooks/useConversations.ts:170-179` | ignores it |
| `hooks/useNotifications.ts:64-73` | ignores it |

So exactly one handler reads the payload, and it reads only `new`. `eventType`,
`old`, `schema`, `table`, `commit_timestamp` and `errors` are included for
fidelity but nothing depends on them today. **This is the full audit — there is
no hook whose payload shape I was unable to verify.**

The broadcast path is separate: `hooks/useLiveDriverLocation.ts:29` reads
`msg.payload` and checks `typeof p.lat === 'number'`. `sendBroadcast` therefore
delivers `{ payload }` (no `event`/`type` wrapper needed by the consumer, though
including them is harmless).

### 4.5 Write-to-refetch chains this must drive

| Action | Write | Emit | Listener | Visible result |
|---|---|---|---|---|
| Toggle a weekday in Edit Schedule | `availability` upsert | `INSERT`/`UPDATE` on `availability` | `useCarpool.ts:212` → debounced 800 ms refetch | the community re-clusters around the new time (§6) |
| Send a chat message | `messages` insert | `INSERT` on `messages` | `useMessages.ts:146` (filtered) + `useConversations.ts:172` | own message reconciles; list preview updates |
| Bot reply | `messages` insert by another `sender_id` | same | same | reply bubble appears through the production receive path |
| Skip a day | `schedule_skips` insert/delete | on `schedule_skips` | `useCarpool.ts:217` | day drops out of the rotation |
| Ambient beat 1 | `swaps` insert + `notifications` insert | on both | `useSwaps.ts:110`, `useNotifications.ts:68` | swap-board badge and bell badge both increment |
| Start ride | `trips` upsert | on `trips` (filtered by `driver_id`) | `useTrip.ts:92` | status banner flips to "En route" |
| Picked-up toggle | `trip_pickups` insert/delete | on `trip_pickups` | `useTrip.ts:98` | check-mark persists |

Note the 800 ms debounce at `useCarpool.ts:198-205`: schedule edits reshape the
community after roughly one second, not instantly. That is within the plan's
"looks intentional" bar but worth knowing on stage.

---

## 5. Fixture identities

### 5.1 UUIDs

The presenter's id must sort first lexicographically among the cluster, because
`lib/pairing.ts:79` and `:213` break every tie on `userId` ascending. An
all-zeros prefix guarantees it (`'0' < 'd'`).

| Person | UUID |
|---|---|
| Robert Calder (**presenter**) | `00000000-0000-4000-8000-000000000001` |
| Marcus Delgado | `d1000000-0000-4000-8000-000000000002` |
| Priya Raghavan | `d2000000-0000-4000-8000-000000000003` |
| Jenna Whitfield | `d3000000-0000-4000-8000-000000000004` |
| Tom Okafor | `d4000000-0000-4000-8000-000000000005` |
| Rachel Kim | `d5000000-0000-4000-8000-000000000006` |

All six are structurally valid v4 UUIDs (version nibble `4`, variant nibble `8`).

### 5.2 Zone

`lib/zones.ts:18` maps `'san jose' → 'San Jose'`. **All six `neighborhood`
values are the literal string `'San Jose'`**, which is also a member of
`NEIGHBORHOODS` (`types/index.ts:57`) so the signup `SelectField` accepts it.
`useCarpool.ts:137` calls `cityZone(row.user.neighborhood)`, so all four cluster
members land in the same zone bucket at `lib/pairing.ts:152-156`. Any other
Silicon Valley city would land them in `'West Valley'` or `'Peninsula'` and the
cluster would never form.

### 5.3 Coordinates — exact `DEMO_ROUTE` vertices

`lib/demoRouteData.ts` holds 463 vertices; `DEMO_STOPS` (`:496-501`) names four
indices. Coordinates below are the literal values at those indices, verified by
parsing the file:

| Index | `DEMO_ROUTE[i]` | `DEMO_STOPS` name | Cumulative distance | Fraction of route |
|---|---|---|---|---|
| 0 | `{ lat: 37.31968, lng: -121.912 }` | BASIS Independent Silicon Valley (`school`) | 0 m | 0.0000 |
| **120** | `{ lat: 37.29572, lng: -121.91356 }` | *(none — see below)* | 2 859 m | 0.2258 |
| 205 | `{ lat: 37.27598, lng: -121.90603 }` | La Mirada Drive (`rider`) | 5 562 m | 0.4393 |
| 365 | `{ lat: 37.24701, lng: -121.88795 }` | Dellwood Way (`rider`) | 9 867 m | 0.7793 |
| 462 | `{ lat: 37.22825, lng: -121.89913 }` | Alvarado Court (`driver`) | 12 662 m | 1.0000 |

**Judgment call — index 120 for Marcus.** The plan puts Marcus on Saddle Rack
St, but the route never goes there: the nearest `DEMO_ROUTE` vertex to Saddle
Rack St (≈ 37.3235, −121.9047) is vertex 0 at 774 m, i.e. the route heads south
from campus and never doubles back north. With only three home stops in
`DEMO_STOPS` and four people in the cluster, one member would get a pin the car
never passes. Vertex 120 sits on the longest unbroken leg (school → 205 is 44 %
of the route with no stop) at longitude −121.9136, which is Meridian Ave. So
Marcus lives on Meridian Ave and his pin falls exactly on the driven line.

`fixtures.ts` derives the coordinates from the route rather than hard-coding
them, so a regenerated route stays consistent:

```ts
import { DEMO_ROUTE } from '@/lib/demoRouteData';
const at = (i: number) => ({ latitude: DEMO_ROUTE[i].lat, longitude: DEMO_ROUTE[i].lng });
```

**Do not add a fifth entry to `DEMO_STOPS`.** Once the `DEMO_STOPS` override in
`components/map/LiveMap.tsx:145-158` is removed (plan item 2), `DEMO_STOPS` is
no longer read at runtime; pins come from the real `users` rows via
`LiveTripScreen.tsx:126-140`.

Tom and Rachel are never in a car, so their coordinates are never pinned
(`LiveTripScreen.tsx:92-99` builds `memberIds` from the assignment only). They
get plausible off-route San Jose coordinates purely so `latitude`/`longitude` are
non-null.

### 5.4 The six people

Car colour keys are from `CAR_COLORS` (`lib/carOptions.ts:36-45`:
`crimson|black|white|silver|blue|green|gray|orange`) and type keys from
`CAR_TYPES` (`:47-51`: `sedan|suv|minivan`). Note the palette spells it
**`gray`**, not `grey`. Plates are 7 alphanumeric characters, which passes
`validatePlate('CA', …)` (`lib/licensePlate.ts:119-140`: the
`^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$` structure test and the 1–7 length bound for CA,
`plateMaxFor` returning the `DEFAULT_MAX` of 7).

| Field | Robert Calder | Marcus Delgado | Priya Raghavan | Jenna Whitfield | Tom Okafor | Rachel Kim |
|---|---|---|---|---|---|---|
| `id` | `00000000-…-0001` | `d1000000-…-0002` | `d2000000-…-0003` | `d3000000-…-0004` | `d4000000-…-0005` | `d5000000-…-0006` |
| `full_name` | Robert Calder | Marcus Delgado | Priya Raghavan | Jenna Whitfield | Tom Okafor | Rachel Kim |
| `child_name` | Ava Calder | Diego Delgado | Anika Raghavan | Ellie Whitfield | Femi Okafor | Soo-jin Kim |
| `grade` | `9th` | `7th` | `10th` | `8th` | `11th` | `6th` |
| `neighborhood` | San Jose | San Jose | San Jose | San Jose | San Jose | San Jose |
| `email` | robert.calder@district.school.edu | marcus.delgado@district.school.edu | priya.raghavan@district.school.edu | jenna.whitfield@district.school.edu | tom.okafor@district.school.edu | rachel.kim@district.school.edu |
| `address` | 5412 Alvarado Ct, San Jose, CA 95123 | 2115 Meridian Ave, San Jose, CA 95125 | 1480 La Mirada Dr, San Jose, CA 95124 | 3260 Dellwood Way, San Jose, CA 95123 | 1032 Foxworthy Ave, San Jose, CA 95118 | 877 Hillsdale Ave, San Jose, CA 95136 |
| route index | **462** | **120** | **205** | **365** | — | — |
| `latitude` | `37.22825` | `37.29572` | `37.27598` | `37.24701` | `37.27620` | `37.26980` |
| `longitude` | `-121.89913` | `-121.91356` | `-121.90603` | `-121.88795` | `-121.90120` | `-121.86880` |
| `car_capacity` | **4** | **0** | **0** | **4** | **5** | **0** |
| `car_color` | `silver` | `null` | `null` | `blue` | `gray` | `null` |
| `car_type` | `minivan` | `null` | `null` | `minivan` | `suv` | `null` |
| `car_model` | `Honda Odyssey` | `null` | `null` | `Toyota Sienna` | `Honda CR-V` | `null` |
| `license_plate` | `7XKR482` | `null` | `null` | `6TRJ109` | `8CWL356` | `null` |
| role in demo | presenter; drives when ticked | rider | rider | fallback driver | swap board + DM | swap board |

`car_capacity: 0` is what keeps Marcus, Priya and Rachel out of the driver
candidate set — `lib/pairing.ts:186` requires `p.capacity >= 1`.

### 5.5 Other seeded rows

Deliberately lean, per the plan.

- **Group chat.** One `conversations` row, `type: 'group'`, `ride_date` = the
  next school day at seed time, `title: 'Carpool · <Mon D>'` (matching
  `lib/conversationUtils.ts:54`), participants = the four cluster ids, plus
  three prior `messages` from Jenna / Priya / Marcus with `created_at`
  staggered over the previous afternoon.
- **DM with Tom.** `type: 'dm'`, `ride_date: null`, `title: null`, participants
  = `{PRESENTER_ID, TOM_ID}`, two prior messages.
- **Notifications.** Two rows for `PRESENTER_ID`: one `type:'message'` with
  `data: { conversation_id: <group id>, conversation_title: 'Carpool · <Mon D>' }`
  and `read_at: null` (unread — drives the bell badge at `ScheduleScreen.tsx:413`),
  one `type:'trip'` with `read_at` set. The `data` keys must match
  `hooks/usePushRegistration.ts:26-44` and `screens/NotificationsScreen.tsx:73-95`.
- **Swap.** One `swaps` row: `requester_id: RACHEL_ID`, `day` = the next
  Thursday, `status: 'open'`, `note: 'Dentist appointment — can anyone cover?'`.
  It is invisible to `useCarpool` because that query filters
  `.eq('status','filled')` (`useCarpool.ts:101`).
- **Completed trips.** Six `trips` rows with `status: 'completed'`,
  `driver_id` alternating presenter/Jenna, `ride_date` on the six preceding
  school days, `rider_ids` = the other three cluster ids. These feed the impact
  strip (plan item 7), which computes miles with `haversineMeters`
  (`lib/geo.ts:7`) against `SCHOOL.point` (`lib/places.ts:8-11`) and CO₂ at
  0.404 kg/mile.

---

## 6. The adaptive availability algorithm

### 6.1 Why generate rather than store

The presenter's `availability` starts empty and is filled live on stage.
`lib/pairing.ts:168-171` clusters only members within 30 minutes of the earliest
in the zone, so any *stored* time for the fake parents can strand the presenter
outside the window. Generating on read makes the community reshape around
whatever the presenter picks.

### 6.2 Where it hooks in

Inside `store.readTable`:

```ts
export function readTable(t: DemoTable): Row[] {
  if (t === 'availability') return [...tables.availability, ...companionAvailability()];
  if (t === 'blocks') return tables.blocks.filter(r => r.blocker_id === getSession()?.user.id);
  return tables[t];
}
```

This placement is what makes both availability queries correct at once:

- `useCarpool.ts:96` filters `.eq('participating', true)`; generated rows carry
  `participating: true`, so they are included.
- `useMySchedule.ts:75` filters `.eq('user_id', user.id)`; generated rows belong
  to other users, so the presenter's Edit Schedule screen shows only their own
  stored rows. **Generated rows must never carry `PRESENTER_ID`.**

### 6.3 The algorithm

```
WEEKDAYS      = ['mon','tue','wed','thu','fri']
OFFSETS       = { MARCUS_ID: 0, PRIYA_ID: 10, JENNA_ID: 15 }   // minutes

function companionAvailability(): Row[]:
  out = []
  for d in WEEKDAYS:
    mine = tables.availability.find(r => r.user_id == PRESENTER_ID && r.day_of_week == d)

    # base pickup time for this weekday
    if mine and mine.participating and mine.dismissal_time:
      base = hhmm(mine.dismissal_time)              # slice(0,5), matches useCarpool.ts:136
    else:
      base = DEMO_FALLBACK_PICKUP                   # '15:15'

    presenterDrives = Boolean(mine and mine.participating and mine.can_drive)

    for (uid, offset) in OFFSETS:
      out.push({
        user_id:        uid,
        day_of_week:    d,
        participating:  true,
        dismissal_time: addMinutes(base, offset) + ':00',
        # Jenna volunteers only when the presenter does not — see §7
        can_drive:      uid == JENNA_ID ? not presenterDrives : false,
        role:           'ride',
        is_driving:     false,
      })
  return out

function addMinutes(hhmm, m):
  total = (minutes(hhmm) + m) mod 1440
  return pad2(total div 60) + ':' + pad2(total mod 60)
```

`addMinutes` uses `mod 1440` purely defensively; the reachable maximum is
`18:00 + 15 = 18:15`, which cannot wrap.

**Fallback when the presenter has not set a day.** `base = '15:15'`, matching
`EditScheduleScreen.tsx:31`'s `DEFAULT_TIME`, and `presenterDrives = false` so
Jenna volunteers. Marcus/Priya/Jenna then cluster at 15:15 / 15:25 / 15:30 and
Jenna drives two riders — a populated community exists before the presenter
touches anything, which is what makes the *first* screen of the demo look alive.

**Tom and Rachel get no `availability` rows at all.** Reason: any participating
same-zone member with a *fixed* time can become the sliding-window anchor and
split the presenter out of the cluster. Worked counter-example — with Tom and
Rachel stored at 17:30 and the presenter picking 18:00 (the clock's maximum),
`lib/pairing.ts:159` sorts to `[Tom 17:30, Rachel 17:30, Robert 18:00,
Marcus 18:10, Priya 18:15, Jenna 18:15]`; the anchor is 17:30, the window closes
at 18:00, and the presenter lands in *Tom's* car while Marcus and Priya are
pushed into a second cluster. Having no rows makes that unreachable by
construction. Tom and Rachel exist only for the swap board and the DM thread,
neither of which reads `availability`.

### 6.4 Proof of the 30-minute invariant

Let `b = minutes(base)`. The `TimePickerClock` can produce exactly twelve
values: `HOURS_12 = [3,4,5,6]` (`TimePickerClock.tsx:19`),
`MINUTES = [0,15,30,45]` (`:20`), narrowed by `minuteOptionsForHour`
(`:30-34`) to drop 3:00 and to allow only 6:00 in the 6 o'clock hour, and
emitted as 24-hour at `:91`. So

```
base ∈ {15:15, 15:30, 15:45, 16:00, 16:15, 16:30, 16:45, 17:00, 17:15, 17:30, 17:45, 18:00}
b    ∈ {915, 930, 945, 960, 975, 990, 1005, 1020, 1035, 1050, 1065, 1080}
```

Zone `'San Jose'` contains exactly the four cluster members (§6.3 last
paragraph), with times:

```
Robert = b        Marcus = b        Priya = b + 10        Jenna = b + 15
```

`lib/pairing.ts:159` sorts ascending by time, ties by `userId`. The minimum is
`b`, so the anchor is `b` (Robert, whose all-zeros id wins the tie against
Marcus — irrelevant to the window, but deterministic). The admission test at
`:168-171` is `minutes(t) <= minutes(anchor) + 30`, i.e. `t ≤ b + 30`. The
maximum member time is `b + 15 ≤ b + 30`. ∎

All four are therefore in one cluster, the inner `while` consumes the whole
sorted array, `i = j = 4`, and the outer loop emits exactly one car. The unified
pickup time is `cluster[last].time = b + 15` (`:179`).

When the presenter has not set the day, the same argument runs over
`{b, b+10, b+15}` with `b = 915`.

Automated check (plan's verification section): loop all twelve clock values ×
`{presenter participating, not participating}` × `{can_drive on, off}` and assert
the resulting `UserAssignment` has `role !== 'unmatched'` and `riders.length === 3`
whenever the presenter participates.

### 6.5 Early dismissal

`lib/pairing.ts:287-297` forces every pickup time to `13:00` on early-dismissal
days *after* clustering. Clustering itself is unaffected, so the invariant holds;
only the displayed time changes. `2026-08-12` — the first day of school, and the
current date at the time of writing — is one of these
(`lib/schoolCalendar.ts:62`). See risk R12.

---

## 7. Driver-selection determinism

### 7.1 Why the plan's tie-break argument is not sufficient on its own

The plan reasons that the presenter's low-sorting id wins the tie at
`lib/pairing.ts:213`. That tie-break only fires when `driveCount` is equal
(`:210-212`), and `driveCount` is cumulative across the whole season: the engine
walks every school day from `schoolYearStart()` = `2026-08-12`
(`lib/schoolCalendar.ts:185-187`) forward, incrementing at `:242`.

If both the presenter and Jenna volunteer on the same weekday, the counts
alternate:

| Date | `driveCount` before | Winner |
|---|---|---|
| Aug 12 (Wed) | R 0, J 0 → tie → id | **Robert** (R 1) |
| Aug 13 (Thu) | R 1, J 0 | **Jenna** (J 1) |
| Aug 14 (Fri) | R 1, J 1 → tie → id | **Robert** (R 2) |
| Aug 17 (Mon) | R 2, J 1 | **Jenna** (J 2) |

So with the presenter participating and volunteering on all five weekdays, who
drives "the next school day" is effectively a coin flip. On stage that reads as
a bug.

### 7.2 The fix: couple Jenna's `can_drive` to the presenter's

Per §6.3, the generated row sets

```
Jenna.can_drive = NOT (presenter participates that weekday AND presenter.can_drive)
```

This makes the candidate set a singleton in both directions, which removes
`driveCount` from the outcome entirely.

**Case A — "I can drive" ticked.** `lib/pairing.ts:184-189` builds candidates as
`capacity >= 1 && !coverOff && (canDrive || coverForce)`:

| Member | capacity | canDrive | candidate? |
|---|---|---|---|
| Robert | 4 | true | ✅ |
| Marcus | 0 | false | ❌ (capacity) |
| Priya | 0 | false | ❌ (capacity) |
| Jenna | 4 | **false** | ❌ (canDrive) |

`ordered = [Robert]`. The chosen loop (`:221-228`): `seats = 0 < 4` → push
Robert, `seats = 4`; `4 < 4` is false → stop. `chosen = [Robert]`.
`riders = [Marcus, Priya, Jenna]`. `seatRidersBlockAware` (`:97-124`) gives
Robert `free = capacity - 1 = 3` and no blocks exist, so all three seat.
Result: Robert `role: 'drive'`, **`riders.length === 3`**, pickup `b + 15`.

**Case B — "I can drive" unticked.**

| Member | capacity | canDrive | candidate? |
|---|---|---|---|
| Robert | 4 | **false** | ❌ |
| Marcus | 0 | false | ❌ |
| Priya | 0 | false | ❌ |
| Jenna | 4 | **true** | ✅ |

`ordered = [Jenna]`, `seats = 4`, `chosen = [Jenna]`,
`riders = [Robert, Marcus, Priya]`, `free = 3` → all seat. Result: Robert
`role: 'ride'`, `driver` = Jenna, **`riders.length === 3`** (which includes the
presenter — `ScheduleScreen.tsx:315-327` filters `currentUserId` out of "Riding
with you", so the UI shows two names, and `DriverVehicleCard`
(`LiveTripScreen.tsx:523-525`) and `CarCard` (`ScheduleScreen.tsx:309-314`)
render Jenna's blue Toyota Sienna and plate `6TRJ109`).

Both cases are independent of `driveCount`, of the current date, and of how many
days the presenter has configured. Exactly 3 riders and exactly 1 driver either
way, which is the plan's requirement.

**Second line of defence.** Keep the all-zeros presenter UUID anyway: it makes
`byTimeThenId` (`:75-80`) put the presenter first in the sorted cluster and makes
`:213` deterministic if a future change reintroduces a two-candidate day.

### 7.3 Interaction with cover requests

If the presenter accepts Rachel's swap during the demo, `accept_swap` sets
`status: 'filled'` and `accepted_by: PRESENTER_ID`. `useCarpool.ts:98-101` then
picks it up, `:165` puts `PRESENTER_ID|<thursday>` into `coverForce`, and
`lib/pairing.ts:207-209` sorts cover acceptors first — so the presenter drives
that Thursday even if unticked. That is correct real behaviour and a good demo
beat. `coverOff` gains `RACHEL_ID|<thursday>`, which is inert because Rachel has
no `availability` rows.

---

## 8. Chat bot and typing indicator

`script.ts` never touches `useMessages`. It subscribes to the store:

```
startDemoScript():
  subscribeChanges('messages', 'INSERT', undefined, payload => {
    row = payload.new
    if (row.sender_id !== PRESENTER_ID) return          // never reply to a bot
    responder = pickResponder(row.conversation_id)      // DM: the other participant
                                                        // group: rotate over the non-presenter participants
    setTyping(row.conversation_id, false)
    after DEMO_BOT_THINK_MS:
      setTyping(row.conversation_id, true)
    after DEMO_BOT_THINK_MS + DEMO_BOT_TYPING_MS:
      setTyping(row.conversation_id, false)
      insertRows('messages', [{ conversation_id, sender_id: responder, content: replyFor(row.content) }])
      if (reply.followUp) after +DEMO_BOT_FOLLOWUP_MS: insert the follow-up
  })
```

The insert fires the normal `postgres_changes` INSERT, the filtered subscription
at `hooks/useMessages.ts:146-162` receives it, `resolveName` hits
`users.select('full_name').eq('id', …).single()`, and the bubble renders through
the production path. No app code changes.

`replyFor` is a keyword table (`hello|hey|hi`, `when`, `time`, `drive|driving`,
`thanks|thank you`, `tomorrow|monday|…`) with a **mandatory default**. A missed
reply is the worst failure mode on stage, so the default must be
unconditional — never `return` without inserting something.

Debounce: if a reply is already pending for a conversation, cancel its timers and
restart from the newest presenter message, so rapid typing produces one reply
rather than a pile-up.

`onDemoTyping(conversationId, cb)` backs the `•••` footer row that
`ConversationScreen` adds to its existing `FlatList` (plan item 5). It is a plain
listener map in `script.ts`; the screen subscribes in a `useEffect` keyed on
`conversationId` and renders the footer only while `typing === true`.

---

## 9. Signup, login, and the school-email gate

All of this is `DEMO_MODE`-gated inside `screens/auth/SignupScreen.tsx` and
`screens/auth/LoginScreen.tsx`; no new module is needed beyond
`DEMO_SIGNUP_PREFILL`.

- Initial `form` state (`SignupScreen.tsx:42-58`) is seeded from
  `DEMO_SIGNUP_PREFILL`, and `addressCoords` (`:61`) is seeded with
  `DEMO_SIGNUP_PREFILL.coords` so the blocking `geocodeAddress` call at `:215`
  is skipped.
- `form.email` starts as `rejectedEmail` (`robert.calder@gmail.com`).
- The invite-code `Input` (`:303-316`) and its helper text are not rendered, the
  `inviteCode` check in `validate()` (`:96-98`) is skipped, and the
  `validate_invite_code` round-trip (`:170-185`) is skipped. The RPC is still
  implemented in the fake client as a safety net.
- A demo-only rule in `validate()`: if the trimmed email does not end with
  `@${DEMO_SCHOOL_EMAIL_DOMAIN}`, set
  `errors.email = 'Use your school-issued email (name@district.school.edu). Personal addresses aren’t accepted.'`
  and mirror it into `globalError`, exactly like the plate branch at `:141-147`.
- `LoginScreen` (`:23-24`) prefills `acceptedEmail` and
  `DEMO_SIGNUP_PREFILL.password`; the fake `signInWithPassword` accepts anything.

`car_model` cannot be supplied by the form — `SignupFormValues`
(`types/index.ts:94-110`) has no model field and `createAccount` does not send
one (`SignupScreen.tsx:230-243`). The fixture value `'Honda Odyssey'` must
therefore survive the fake `create-account` merge (§2.4), or the presenter's
`CarCard` falls back to "Silver minivan".

---

## 10. Hardware paths disabled in demo

| Hook | Change | Why |
|---|---|---|
| `hooks/usePushRegistration.ts:56-69` | skip `registerForPushNotificationsAsync()`'s token step and the `register_push_token` RPC, but **still call `Notifications.requestPermissionsAsync()`** | `getExpoPushTokenAsync` (`lib/push.ts:52`) has no APNs entitlement in Expo Go; the permission is still required for the local ambient banners |
| `hooks/useLocationSharing.ts:34-81` | early-return `{ sharing: false, error: null }` | `requestForegroundPermissionsAsync` / `requestBackgroundPermissionsAsync` (`:36,48`) each raise a system dialog mid-demo |
| `hooks/useTripGeofencing.ts:77-116` | early-return before `requestForegroundPermissionsAsync` (`:79`) | same, plus geofences cannot fire indoors; **Start ride** (`LiveTripScreen.tsx:196-208`) is the manual entry point and already exists |

The `AppState` listener and both `TaskManager.defineTask` registrations
(`lib/locationTask.ts:51`, `lib/geofenceTask.ts:72`) stay — they only register
handlers and never fire when the corresponding `start…Async` is never called.

---

## 11. Risk register

Ordered by how badly and how silently each one breaks the demo.

**R1 — An unmapped embed constraint blanks the whole schedule.**
`hooks/useCarpool.ts:131` is `if (!row.user || !row.dismissal_time) continue;`.
If embed A does not hydrate, every participant is skipped, `participants` is
`[]`, and the Schedule screen reads "Not carpooling this day" with no error
anywhere. *Mitigation:* `FK_BY_CONSTRAINT` is a closed map (§2.2) validated at
module load in `__DEV__`; the embed parser throws on an unknown constraint
rather than returning `null`; the unit tests assert all five embeds hydrate.

**R2 — `lib/supabase.ts:23-29` calls `supabase.auth.startAutoRefresh()` on every
foreground.** The listener runs at module load, unconditionally, before any
demo code has a chance to guard it. If the fake `auth` omits
`startAutoRefresh`/`stopAutoRefresh` the app throws
`_supabase.supabase.auth.startAutoRefresh is not a function` on the first
background/foreground cycle — i.e. the first time the presenter switches apps on
stage. *Mitigation:* both are required members of the fake `auth` object,
implemented as no-ops (the jest blueprint already models them at
`__mocks__/supabaseMockFactory.ts:172-173`).

**R3 — `lib/mapHtml.ts:142` creates its own supabase-js inside a WebView.**
`buildMapHtml` embeds `SUPABASE_URL`/`SUPABASE_ANON_KEY` and calls
`window.supabase.createClient(...)` from a CDN script tag (`:59`). That client is
completely outside the interception seam and would hit the network. *Mitigation:*
it is reachable only from `components/map/LiveMap.web.tsx:12`, which React Native
resolves only on `Platform.OS === 'web'`. The demo runs on a physical iPhone via
Expo Go, where `components/map/LiveMap.tsx` (react-native-maps) is used and
`mapHtml` is never called. Do not demo on web. If the web target ever matters,
`LiveMap.web.tsx` must skip the WebView under `DEMO_MODE`. The CDN `<script>`
tags (`:43,58,59`) would also fail in airplane mode, so the web map degrades to
a blank pane rather than an error.

**R4 — Nominatim calls leak to the network from the address field.**
`lib/geocode.ts` `searchAddresses` fires on every keystroke ≥ 4 chars from
`AddressAutocomplete` (used at `SignupScreen.tsx:354` and
`EditProfileScreen.tsx:162`), and `geocodeAddress` runs at `SignupScreen.tsx:215`
and `EditProfileScreen.tsx:91`. Both catch and return `[]`/`null`, so airplane
mode degrades rather than crashes — but `geocodeAddress` returning `null` on a
*changed* address **blocks the save** at `EditProfileScreen.tsx:92-97` and
`SignupScreen.tsx:216-225`. *Mitigation:* the demo prefills `addressCoords`
(§9), which short-circuits the signup geocode. For belt and braces, guard both
`lib/geocode.ts` exports with `DEMO_MODE` (return `[]` and
`DEMO_SIGNUP_PREFILL.coords` respectively). Do not edit the address on stage.

**R5 — `.or()` unimplemented silently empties the swap board.**
`hooks/useSwaps.ts:81` is the only `.or()` in the codebase, and a builder that
ignores it would return every swap; one that treats it as "no match" returns
none and `openRequests`/`myRequests` are both `[]` with no error. *Mitigation:*
§3.4 specifies the parser; a parse failure falls back to match-all plus a
`__DEV__` warning, and the unit tests cover both terms.

**R6 — `.is()` is easy to miss.** `hooks/useNotifications.ts:88` uses
`.is('read_at', null)` and it is absent from the plan's method list. Without it
the builder throws `chain.is is not a function` the moment the Notifications
screen mounts and calls `markAllRead` (`NotificationsScreen.tsx:69`).
*Mitigation:* `is` is in the required method table (§3.1).

**R7 — Session persistence would skip the signup walkthrough, and a JS reload
wipes the store.** The store is in-memory: a Fast Refresh or a shake-to-reload
resets every message sent, every schedule edit, and the session. *Mitigation:*
accept it (the plan's dry-run is a single continuous pass) but never reload
mid-demo; disable Fast Refresh in the dev menu before presenting.

**R8 — `useCurrentUser` failing takes down every screen at once.**
`hooks/useCurrentUser.ts:34-38` does `users.select('*').eq('id',uid).single()`
and maps *any* error to `user = null` (`:40-42`). `useCarpool`, `useMySchedule`,
`useSwaps`, `useConversations` and `useNotifications` all bail out on a null
user, so a single wrong `PRESENTER_ID` produces a fully blank, error-free app.
*Mitigation:* the session's `user.id` and the seeded `users` row id are both
`PRESENTER_ID` from `fixtures.ts`; nothing else may construct that id.

**R9 — Two rows sharing a `created_at` reorder the chat.**
`hooks/useMessages.ts:43-46` sorts on `created_at` only, with no id tiebreak, so
a bot reply written in the same millisecond as the question can render above it.
*Mitigation:* `nowISO()` is monotonic (§4.1).

**R10 — Synchronous change delivery re-enters React.** Emitting inside the write
call would run `setMessages` from inside `sendMessage`'s own handler and would
schedule `useCarpool`'s refetch from inside the write it is meant to observe.
*Mitigation:* `setTimeout(fn, 0)` dispatch (§4.3).

**R11 — `blocks` SELECT has no filter.** `lib/moderation.ts:72` relies on RLS.
An unscoped store read would return every block row and
`hooks/useMessages.ts:225` would hide messages from senders the presenter never
blocked. *Mitigation:* `readTable('blocks')` filters on the session user (§4.2).

**R12 — `2026-08-12` is an early-dismissal day.** `lib/schoolCalendar.ts:62`
lists it, so `lib/pairing.ts:287-297` overrides every pickup time to `13:00`. If
the demo is run on or near the first day of school, the presenter picks 3:45 PM
and the card says "Arrive by 1:00 PM". Nothing is broken and the cluster is
unchanged, but it looks wrong. *Mitigation:* on stage, select a calendar day
that is not in `SCHOOL_YEAR_2026_27.earlyDismissal` (`:61-70`) — the calendar
picker makes this a one-tap choice — or be ready to explain it.

**R13 — Outside the school year the entire app is empty.**
`lib/pairing.ts:357-360` returns an empty map for any date before
`2026-08-12` or after `2027-06-04`, and `ScheduleScreen.tsx:130` opens on
`nextSchoolDay(new Date())`, which returns `from` unchanged once the year is
over (`schoolCalendar.ts:238`). *Mitigation:* none in code — this is a real
property of the app. Note it in the demo runbook.

**R14 — The realtime→refetch path has an 800 ms debounce.**
`hooks/useCarpool.ts:198-205`. The plan's "reshapes the community around you
instantly" is really "within about a second". *Mitigation:* none needed;
mentioned so the presenter does not tap twice.

**R15 — Sentry initialises before anything else and will try to send.**
`index.ts:1` imports `lib/sentry.ts`, which calls `Sentry.init` at module scope
with a real DSN. Every `Sentry.captureException` in the demo path queues a
network request. Offline, the transport buffers and drops; it does not throw.
*Mitigation:* none required, but if airplane-mode testing shows any hang, add
`enabled: !DEMO_MODE` to the `Sentry.init` options.

**R16 — Realtime payload shapes.** Audited in full at §4.4: exactly one handler
(`hooks/useMessages.ts:155`) reads the payload, and it reads only `new`. There
is no hook whose payload shape could not be verified.

**R17 — `removeChannel` must never reject.** It is `void`-ed in eight cleanup
paths (`useCarpool.ts:234`, `useSwaps.ts:116`, `useTrip.ts:104`,
`useConversations.ts:183`, `useMessages.ts:167`, `useNotifications.ts:77`,
`useLiveDriverLocation.ts:38`, `locationTask.ts:29,46`). A rejection becomes an
unhandled promise rejection, which `lib/sentry.ts`'s global handler turns into a
red LogBox overlay. *Mitigation:* it always resolves `'ok'`, wrapping its body
in a try/catch.

**R18 — `insert` returning `data: null` where a caller expects a row.**
Only one insert reads `data`: `hooks/useMessages.ts:193-203`, which chains
`.select(...).single()` and throws `'send failed'` on `insErr || !data`,
reverting the optimistic bubble. *Mitigation:* §3.3 requires insert + select +
single to return the inserted row; the unit tests cover it explicitly.

---

## 12. Test hooks the implementation must make possible

To satisfy the plan's automated-verification bullet without importing React:

- `lib/demo/store.ts` exports a `__resetStore()` (dev/test only) that re-seeds
  from `SEED_TABLES` and clears every subscription.
- `lib/demo/client.ts`'s `createDemoClient()` returns a fresh facade but **not**
  fresh state — tables, session and subscriptions are module-level, so every
  client in a process shares them. This mirrors a real backend and matches the
  app, which constructs exactly one client. Tests isolate with `__resetStore()`,
  never by constructing a second client.
- `companionAvailability()` is exported from `store.ts` so the exhaustive
  12-clock-value loop can assert the window invariant directly, without going
  through the query builder.
