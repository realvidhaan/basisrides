/**
 * Demo mode — the scripted layer: chat bot, typing indicator, ambient beats.
 *
 * Everything here is stagecraft on top of the in-memory backend. The rule that
 * makes it safe is that it only ever WRITES THROUGH THE STORE: a bot reply is an
 * ordinary `messages` insert, so the store emits its ordinary `postgres_changes`
 * INSERT, `hooks/useMessages.ts:146` receives it on its filtered subscription and
 * the bubble renders through the production path. Nothing in `hooks/` or
 * `screens/` is aware a bot exists — the one exception is the ••• footer, which
 * is a pure presentation detail the store has no business carrying.
 *
 * Import rules (docs/demo-architecture.md §1.4): store, fixtures, demoMode and
 * expo-notifications only. Importing `client` or `@/lib/supabase` would close the
 * cycle `supabase -> script -> supabase`.
 *
 * Unreachable in a normal build: `startDemoScript()` is called from exactly one
 * place, behind `DEMO_MODE`, which folds to the literal `false` at bundle time.
 */
import * as Notifications from 'expo-notifications';
import {
  DEMO_AMBIENT_SWAP_MS,
  DEMO_AMBIENT_TRIP_DONE_MS,
  DEMO_BOT_FOLLOWUP_MS,
  DEMO_BOT_THINK_MS,
  DEMO_BOT_TYPING_MS,
} from '@/lib/demoMode';
import { DEMO_AMBIENT_SWAP, PRESENTER_ID } from '@/lib/demo/fixtures';
import {
  insertRows,
  onAuthChange,
  readTable,
  subscribeChanges,
  type Row,
} from '@/lib/demo/store';

type Timer = ReturnType<typeof setTimeout>;

// ---------------------------------------------------------------------------
// The reply table
// ---------------------------------------------------------------------------

interface Reply {
  text: string;
  /** An optional second bubble, sent after DEMO_BOT_FOLLOWUP_MS. */
  followUp?: string;
}

/**
 * Keyword → reply, first match wins.
 *
 * Ordered specific-to-general on purpose. "hi, what time tomorrow?" contains
 * three of these patterns, and the one worth answering is the question, not the
 * greeting — so greetings sit at the bottom and only fire for a message that
 * says nothing else. The clock rule sits above the "when/time" rule for the
 * same reason: "3:15?" is an offer to confirm, "what time?" is a question.
 *
 * The copy is deliberately person-neutral. The responder is whoever the
 * conversation supplies (§ pickResponder), so a line that named a child or a car
 * would be wrong for two of the three possible group speakers.
 */
const REPLIES: readonly { match: RegExp; reply: Reply }[] = [
  {
    match: /\b(thanks|thank you|thx|ty|appreciate(d| it)?)\b/i,
    reply: { text: 'Anytime! See you at pickup.' },
  },
  {
    // Any clock time — "3:15", "3:15pm", "at 4 pm". A bare "4" is not enough:
    // it collides with grades, seat counts and dates.
    match: /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*[ap]\.?m\.?\b/i,
    reply: { text: "That time works for me — I'll be at the front circle." },
  },
  {
    match: /\b(driv\w+|carpool|carpooling|ride|rides|seat|seats|wheel)\b/i,
    reply: { text: "Either way works — I can drive, or happily ride along." },
  },
  {
    match: /\b(late|delayed|running behind|traffic|stuck|held up)\b/i,
    reply: { text: "No rush — we'll wait by the front circle." },
  },
  {
    match: /\b(cancel|can'?t|cannot|skip|sick|away|out of town|won'?t)\b/i,
    reply: { text: 'No problem — I can cover that day.' },
  },
  {
    match: /\b(when|what time|time|pick ?up|dismissal|schedule)\b/i,
    reply: {
      text: 'Dismissal is 3:15 — does that work for you?',
      followUp: 'We can push it ten minutes if that is easier.',
    },
  },
  {
    match:
      /\b(today|tonight|tomorrow|mon(day)?|tues?(day)?|wed(nesday)?|thur?s?(day)?|fri(day)?|this week|next week|weekend)\b/i,
    reply: { text: "That day works on our end. I'll mark it down." },
  },
  {
    match: /\b(ok|okay|yes|yeah|yep|yup|sure|sounds good|works|perfect|great|deal|got it)\b/i,
    reply: { text: 'Perfect — see you then.' },
  },
  {
    match:
      /\b(hi|hey|hello|yo|howdy|sup|morning|afternoon|evening|how are you|how'?s it going|how is it going|what'?s up)\b/i,
    reply: { text: "I'm good, thanks — when should we carpool?" },
  },
];

/**
 * The unconditional fallback, indexed by how many messages the presenter has
 * sent in this conversation.
 *
 * This is the single most load-bearing thing in the file. A presenter who types
 * something unscripted on stage and gets silence has a dead demo, so `replyFor`
 * can never return nothing — and because an unscripted exchange usually runs to
 * two or three turns, the fallback advances instead of repeating one line.
 *
 * Every line here is a pure ACKNOWLEDGEMENT, never an agreement or an answer.
 * The fallback fires precisely when we do not understand the message, so a line
 * that presumes a proposal ("That works for me") reads as a non-sequitur against
 * anything that was not one — "my kid forgot her trombone" being the case that
 * caught this. Acknowledgements stay coherent against literally any input.
 */
const FALLBACK: readonly Reply[] = [
  { text: 'Got it — thanks for the heads up.' },
  { text: 'Understood. I will keep an eye out.' },
  { text: 'Noted — see you at the front circle.' },
];

/** Never returns undefined. See FALLBACK. */
function replyFor(content: string, turn: number): Reply {
  for (const entry of REPLIES) {
    if (entry.match.test(content)) return entry.reply;
  }
  return FALLBACK[turn % FALLBACK.length];
}

// ---------------------------------------------------------------------------
// Typing indicator — a listener map ConversationScreen subscribes to
// ---------------------------------------------------------------------------

const typingState = new Map<string, boolean>();
const typingSubs = new Map<string, ((typing: boolean) => void)[]>();

function setTyping(conversationId: string, typing: boolean): void {
  if ((typingState.get(conversationId) ?? false) === typing) return;
  typingState.set(conversationId, typing);
  for (const cb of typingSubs.get(conversationId) ?? []) cb(typing);
}

/**
 * Subscribe to the ••• state of one conversation. Returns an unsubscribe.
 *
 * The callback fires immediately with the current value: ConversationScreen can
 * be remounted (tab switch, back-and-forward) while the bot is mid-think, and
 * without the initial push the indicator would be missing for that reply.
 */
export function onDemoTyping(
  conversationId: string,
  cb: (typing: boolean) => void,
): () => void {
  const list = typingSubs.get(conversationId) ?? [];
  list.push(cb);
  typingSubs.set(conversationId, list);
  cb(typingState.get(conversationId) ?? false);
  return () => {
    const next = (typingSubs.get(conversationId) ?? []).filter((c) => c !== cb);
    if (next.length > 0) typingSubs.set(conversationId, next);
    else typingSubs.delete(conversationId);
  };
}

// ---------------------------------------------------------------------------
// The bot
// ---------------------------------------------------------------------------

/** Timers in flight per conversation, so a new message can cancel the old reply. */
const pending = new Map<string, Timer[]>();
/** Presenter messages seen per conversation — drives the fallback ladder. */
const turns = new Map<string, number>();
/** Rotation cursor for group chats, so consecutive replies come from different parents. */
const speaker = new Map<string, number>();

function cancelPending(conversationId: string): void {
  for (const t of pending.get(conversationId) ?? []) clearTimeout(t);
  pending.delete(conversationId);
}

function later(conversationId: string, ms: number, fn: () => void): void {
  const list = pending.get(conversationId) ?? [];
  list.push(setTimeout(fn, ms));
  pending.set(conversationId, list);
}

/**
 * Who answers: in a DM the other participant, in a group each non-presenter
 * participant in turn.
 *
 * The `users` fallback exists because the reply must not depend on the
 * participant rows being there — a conversation created live on stage by the
 * group-chat RPC is fine, but "no responder found" must degrade to "somebody
 * answers", never to silence.
 */
function pickResponder(conversationId: string): string | null {
  const participants = readTable('conversation_participants')
    .filter((r) => r.conversation_id === conversationId)
    .map((r) => String(r.user_id))
    .filter((id) => id !== PRESENTER_ID);

  const pool =
    participants.length > 0
      ? participants
      : readTable('users')
          .map((r) => String(r.id))
          .filter((id) => id !== PRESENTER_ID);

  if (pool.length === 0) return null;
  const index = (speaker.get(conversationId) ?? 0) % pool.length;
  speaker.set(conversationId, index + 1);
  return pool[index];
}

function sendBotMessage(conversationId: string, senderId: string, content: string): void {
  // Straight through the store: this emits the same INSERT payload a real
  // Postgres change would, and `created_at` comes from the monotonic clock so
  // the reply can never sort above the question it answers (risk R9).
  insertRows('messages', [{ conversation_id: conversationId, sender_id: senderId, content }]);
}

function onPresenterMessage(row: Row): void {
  const conversationId = String(row.conversation_id);
  const content = String(row.content ?? '');

  // Debounce: rapid typing must produce ONE reply, not a pile-up. Restart from
  // the newest message rather than queueing behind the older one.
  cancelPending(conversationId);
  setTyping(conversationId, false);

  const responder = pickResponder(conversationId);
  if (responder === null) return; // nobody to answer as — only reachable in an empty store

  const turn = turns.get(conversationId) ?? 0;
  turns.set(conversationId, turn + 1);
  const reply = replyFor(content, turn);

  later(conversationId, DEMO_BOT_THINK_MS, () => setTyping(conversationId, true));
  later(conversationId, DEMO_BOT_THINK_MS + DEMO_BOT_TYPING_MS, () => {
    // Order matters: the indicator goes away BEFORE the bubble lands, so the
    // two are never on screen together.
    setTyping(conversationId, false);
    sendBotMessage(conversationId, responder, reply.text);
  });

  if (reply.followUp === undefined) return;
  const followUpAt = DEMO_BOT_THINK_MS + DEMO_BOT_TYPING_MS + DEMO_BOT_FOLLOWUP_MS;
  later(conversationId, followUpAt - DEMO_BOT_TYPING_MS, () => setTyping(conversationId, true));
  later(conversationId, followUpAt, () => {
    setTyping(conversationId, false);
    sendBotMessage(conversationId, responder, reply.followUp as string);
  });
}

// ---------------------------------------------------------------------------
// Ambient beats — real iOS local notifications
// ---------------------------------------------------------------------------

/**
 * Ids of every banner this session scheduled, so teardown can cancel them.
 *
 * Local notifications survive a JS reload: without this, a Fast Refresh during
 * rehearsal leaves a "cover request" armed in iOS that fires in the middle of
 * the next run, with no swap row behind it.
 */
const scheduledIds = new Set<string>();

/** In-flight ambient timers, cleared on teardown. */
let ambientTimers: Timer[] = [];

/** Ride dates already announced, so a re-entered trip screen cannot double-fire. */
const tripDoneFor = new Set<string>();

/**
 * Every notification call runs through one promise chain.
 *
 * Signing in tears down and re-arms in the same tick, so an un-serialised
 * `cancelAll` could resolve AFTER the swap banner it was never meant to touch
 * had been scheduled — and silently eat the beat. Ordering the calls costs
 * nothing here and removes that race entirely.
 */
let notifQueue: Promise<void> = Promise.resolve();

function enqueueNotif(op: () => Promise<void>): void {
  notifQueue = notifQueue.then(op).catch(() => {
    // Permission denied, or a platform with no notifications module. The in-app
    // rows still land, so a beat is degraded rather than lost — and one failed
    // call must not break the chain for the next one.
  });
}

function scheduleBanner(
  title: string,
  body: string,
  data: Record<string, unknown>,
  delayMs: number,
): void {
  enqueueNotif(async () => {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      // SDK 54's typed trigger shape. `seconds` is whole seconds, so the ms
      // constants are rounded to a 1 s floor — a zero interval is rejected.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(delayMs / 1000)),
        repeats: false,
      },
    });
    scheduledIds.add(id);
  });
}

function cancelBanners(): void {
  enqueueNotif(async () => {
    // Cancel by id where we have them, then sweep: a previous JS session's ids
    // are unknowable, and in demo mode nothing else schedules notifications.
    for (const id of scheduledIds) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    }
    scheduledIds.clear();
    await Notifications.cancelAllScheduledNotificationsAsync();
  });
}

/**
 * Beat 1 — a parent asks for cover, DEMO_AMBIENT_SWAP_MS after sign-in.
 *
 * The store write is what makes the banner honest: `useSwaps.ts:108` refetches
 * on the `swaps` INSERT so the board and its badge gain the row, and
 * `useNotifications.ts:64` picks up the bell row. Both are scheduled from the
 * same instant as the banner, so the three land together.
 */
function armSwapBeat(): void {
  const title = 'Cover request';
  const body = `${DEMO_AMBIENT_SWAP.requesterName} needs cover for ${DEMO_AMBIENT_SWAP.dayLabel}.`;

  const timer = setTimeout(() => {
    // Signing out and back in re-arms the beat; the second insert hits the
    // partial unique key on (requester_id, day) among OPEN swaps and is
    // rejected, which is exactly right — the board already shows the request.
    insertRows('swaps', [
      {
        requester_id: DEMO_AMBIENT_SWAP.requesterId,
        day: DEMO_AMBIENT_SWAP.day,
        note: DEMO_AMBIENT_SWAP.note,
        status: 'open',
      },
    ]);
    insertRows('notifications', [
      {
        user_id: PRESENTER_ID,
        // `type: 'swap'` is what NotificationsScreen.handlePress:93 routes on;
        // it needs no `data`, unlike the message and trip rows.
        type: 'swap',
        title,
        body,
        data: null,
      },
    ]);
  }, DEMO_AMBIENT_SWAP_MS);
  ambientTimers.push(timer);

  // Empty `data`: usePushRegistration.routeFromData only knows conversation and
  // ride-date payloads, so tapping this banner just brings the app forward —
  // which is what the presenter wants anyway, with the badge already waiting.
  scheduleBanner(title, body, {}, DEMO_AMBIENT_SWAP_MS);
}

/**
 * Beat 2 — "Trip complete", DEMO_AMBIENT_TRIP_DONE_MS after the demo drive ends.
 *
 * Called from LiveTripScreen's `onDemoArrived`, because the synthetic drive
 * finishes client-side without writing a trip status — there is no store change
 * for this module to subscribe to. Copy matches the seeded completed-trip row in
 * fixtures, which is what the production `notify_on_trip` trigger writes.
 */
export function notifyDemoTripComplete(rideDate: string): void {
  if (tripDoneFor.has(rideDate)) return;
  tripDoneFor.add(rideDate);

  const title = 'Trip complete';
  const body = 'Everyone was dropped off safely.';

  const timer = setTimeout(() => {
    insertRows('notifications', [
      {
        user_id: PRESENTER_ID,
        type: 'trip',
        title,
        body,
        // `ride_date` is what routeFromData and NotificationsScreen use to open
        // the right LiveTrip screen from the row.
        data: { ride_date: rideDate },
      },
    ]);
  }, DEMO_AMBIENT_TRIP_DONE_MS);
  ambientTimers.push(timer);

  scheduleBanner(title, body, { ride_date: rideDate }, DEMO_AMBIENT_TRIP_DONE_MS);
}

// ---------------------------------------------------------------------------
// Arming and teardown
// ---------------------------------------------------------------------------

function teardown(): void {
  for (const t of ambientTimers) clearTimeout(t);
  ambientTimers = [];
  for (const id of [...pending.keys()]) cancelPending(id);
  for (const id of [...typingState.keys()]) setTyping(id, false);
  turns.clear();
  speaker.clear();
  tripDoneFor.clear();
  cancelBanners();
}

let started = false;

/**
 * Arms the bot and the ambient beats. Idempotent; called once from
 * `lib/supabase.ts`, at module load, behind DEMO_MODE.
 */
export function startDemoScript(): void {
  if (started) return;
  started = true;

  // A banner left over from a previous JS session (Fast Refresh, shake-reload)
  // would fire into this one with no data behind it.
  cancelBanners();

  subscribeChanges('messages', 'INSERT', undefined, (payload) => {
    // Only the presenter gets answered — replying to a bot line would loop.
    if (payload.new.sender_id !== PRESENTER_ID) return;
    onPresenterMessage(payload.new);
  });

  // The swap beat is measured from SIGN-IN, not from module load: this module
  // loads while the Welcome screen is still up, which could burn the whole 45 s
  // before anyone is looking at the app. Signing out tears down the timers and
  // the scheduled banners so nothing fires into the next run.
  onAuthChange((event) => {
    teardown();
    if (event === 'SIGNED_IN') armSwapBeat();
  });
}
