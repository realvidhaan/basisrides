/**
 * Demo mode — the scripted chat bot (`lib/demo/script.ts`).
 *
 * The bot is exercised the way the app exercises it: a presenter `messages`
 * INSERT goes into the store, the store emits its ordinary `postgres_changes`
 * payload, and the reply arrives as another ordinary row. Nothing reaches into
 * the module's private reply table, so these tests fail for the same reasons
 * the demo would fail on stage.
 *
 * The load-bearing property is the last one: a presenter who types something
 * unscripted and gets SILENCE has a dead demo in front of an audience. That is
 * asserted property-style over deliberately varied junk rather than over one
 * example.
 */
import {
  DEMO_BOT_FOLLOWUP_MS,
  DEMO_BOT_THINK_MS,
  DEMO_BOT_TYPING_MS,
} from '@/lib/demoMode';
import {
  DEMO_DM_CONVERSATION_ID,
  DEMO_GROUP_CONVERSATION_ID,
  PRESENTER_ID,
  TOM_ID,
} from '@/lib/demo/fixtures';
import type { Row } from '@/lib/demo/store';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

type Store = typeof import('@/lib/demo/store');
type Script = typeof import('@/lib/demo/script');

/**
 * `startDemoScript()` is idempotent behind a module-level flag and `__resetStore`
 * drops every subscription, so re-arming needs a genuinely fresh module
 * registry. Store and script are required together so both live in the SAME
 * registry — otherwise the bot would subscribe to a different store than the
 * one the test writes to, and every assertion would time out on silence.
 */
function armed(): { store: Store; script: Script } {
  jest.resetModules();
  const store = require('@/lib/demo/store') as Store;
  const script = require('@/lib/demo/script') as Script;
  script.startDemoScript();
  return { store, script };
}

/** Long enough for think + typing + an optional follow-up, with slack. */
const FULL_EXCHANGE_MS = DEMO_BOT_THINK_MS + DEMO_BOT_TYPING_MS + DEMO_BOT_FOLLOWUP_MS + 1_000;

interface Exchange {
  sent: Row;
  replies: Row[];
}

/** Send as the presenter, run the clock out, and return whatever came back. */
function exchange(store: Store, conversationId: string, content: string): Exchange {
  const before = store.readTable('messages').length;
  const { rows } = store.insertRows('messages', [
    { conversation_id: conversationId, sender_id: PRESENTER_ID, content },
  ]);
  jest.advanceTimersByTime(FULL_EXCHANGE_MS);
  const after = store.readTable('messages').slice(before + 1);
  return { sent: rows[0], replies: after.filter((r) => r.conversation_id === conversationId) };
}

function texts(replies: Row[]): string[] {
  return replies.map((r) => String(r.content));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// The keyword table
// ---------------------------------------------------------------------------

/**
 * One representative input per pattern in `REPLIES`, in the order the table
 * declares them, with the exact reply each must produce. The table is ordered
 * specific-to-general on purpose, so an input that matches two patterns is part
 * of the contract, not an accident — see the ordering cases below.
 */
const KEYWORD_CASES: { input: string; reply: string }[] = [
  { input: 'thanks so much for picking her up', reply: 'Anytime! See you at pickup.' },
  { input: 'does 3:15 work?', reply: "That time works for me — I'll be at the front circle." },
  { input: 'can you drive on Wednesday', reply: "Either way works — I can drive, or happily ride along." },
  { input: 'I am stuck in traffic', reply: "No rush — we'll wait by the front circle." },
  { input: 'Ellie is sick so we will sit it out', reply: 'No problem — I can cover that day.' },
  { input: 'when does dismissal happen', reply: 'Dismissal is 3:15 — does that work for you?' },
  { input: 'see you tomorrow', reply: "That day works on our end. I'll mark it down." },
  { input: 'sounds good', reply: 'Perfect — see you then.' },
  { input: 'hey there', reply: "I'm good, thanks — when should we carpool?" },
];

describe('scripted replies', () => {
  it.each(KEYWORD_CASES)('“$input” → “$reply”', ({ input, reply }) => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, input);
    expect(replies.length).toBeGreaterThan(0);
    expect(String(replies[0].content)).toBe(reply);
  });

  it('every pattern is covered by a case above', () => {
    // Nine entries in REPLIES (lib/demo/script.ts:61-105). If one is added
    // without a case here it goes untested, so the count is pinned.
    expect(KEYWORD_CASES).toHaveLength(9);
    expect(new Set(KEYWORD_CASES.map((c) => c.reply)).size).toBe(9);
  });

  it('the dismissal question sends a follow-up as a SECOND bubble', () => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, 'what time is pickup?');
    expect(texts(replies)).toEqual([
      'Dismissal is 3:15 — does that work for you?',
      'We can push it ten minutes if that is easier.',
    ]);
  });

  it('answers the question, not the greeting, when a message contains both', () => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, 'hi, what time tomorrow?');
    expect(texts(replies)[0]).toBe('Dismissal is 3:15 — does that work for you?');
  });

  it('treats a bare clock time as a confirmation, not a question', () => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, 'pickup at 4 pm?');
    expect(texts(replies)[0]).toBe("That time works for me — I'll be at the front circle.");
  });
});

// ---------------------------------------------------------------------------
// The fallback — the demo's single biggest failure mode
// ---------------------------------------------------------------------------

/**
 * Deliberately varied: real-world non-sequiturs, punctuation-only, emoji-only,
 * another language, something that looks like a form field, and pure noise.
 * None of these matches any pattern in REPLIES.
 */
const UNSCRIPTED: string[] = [
  'my kid forgot her trombone again',
  'the dog ate the permission slip',
  'Room 204 flooded over the break',
  'please confirm receipt of the attached PDF',
  'we just moved to a new house',
  'asdfghjkl',
  '???',
  '...',
  '🙂',
  '🚗🚗🚗',
  'la cantina está cerrada',
  '¿qué tal?',
  'THE CAPS LOCK IS STUCK',
  'a',
  '   ',
  'Ava got student of the month',
  'new phone who dis',
  'null',
  'undefined',
  'DROP TABLE availability;',
  '<script>alert(1)</script>',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
];

describe('unscripted input (the presenter goes off script)', () => {
  it.each(UNSCRIPTED)('“%s” still gets a reply', (input) => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, input);
    expect(replies.length).toBeGreaterThan(0);
    for (const r of replies) {
      expect(String(r.content).trim().length).toBeGreaterThan(0);
      expect(r.sender_id).not.toBe(PRESENTER_ID);
    }
  });

  it('never goes silent across a long unscripted conversation', () => {
    const { store } = armed();
    for (const input of UNSCRIPTED) {
      const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, input);
      expect(replies.length).toBeGreaterThan(0);
    }
  });

  it('advances through three distinct fallback lines instead of repeating one', () => {
    const { store } = armed();
    const collected = ['my kid forgot her trombone again', 'the dog ate the permission slip', '???'].map(
      (input) => texts(exchange(store, DEMO_GROUP_CONVERSATION_ID, input).replies)[0],
    );
    expect(collected).toEqual([
      'Got it — thanks for the heads up.',
      'Understood. I will keep an eye out.',
      'Noted — see you at the front circle.',
    ]);
    expect(new Set(collected).size).toBe(3);
  });

  it('fallback lines are acknowledgements — none of them presumes a proposal', () => {
    const { store } = armed();
    // The regression this pins: "my kid forgot her trombone again" used to draw
    // "That works for me. I'll be there." An acknowledgement stays coherent
    // against literally any input; an agreement only works against an offer.
    const presumesAProposal =
      /\b(that works|works for me|that time works|i'?ll be there|see you then|sounds good|deal|i can cover|either way|no rush|anytime)\b/i;

    for (let i = 0; i < 9; i += 1) {
      const line = texts(
        exchange(store, DEMO_GROUP_CONVERSATION_ID, `unscripted number ${'x'.repeat(i + 1)}`).replies,
      )[0];
      expect(line).toEqual(expect.any(String));
      expect(line).not.toMatch(presumesAProposal);
      // Acknowledgement-shaped: it reports having heard, it does not agree.
      expect(line).toMatch(/^(Got it|Understood|Noted)\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// Ordering — risk R9
// ---------------------------------------------------------------------------

describe('reply ordering (R9 — useMessages sorts on created_at alone)', () => {
  it('a reply always sorts after the message it answers', () => {
    const { store } = armed();
    const inputs = [...KEYWORD_CASES.map((c) => c.input), ...UNSCRIPTED.slice(0, 6)];
    for (const input of inputs) {
      const { sent, replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, input);
      expect(replies.length).toBeGreaterThan(0);
      for (const reply of replies) {
        expect(String(reply.created_at) > String(sent.created_at)).toBe(true);
        expect(new Date(String(reply.created_at)).getTime()).toBeGreaterThan(
          new Date(String(sent.created_at)).getTime(),
        );
      }
    }
  });

  it('a follow-up sorts after the reply it follows', () => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_GROUP_CONVERSATION_ID, 'what time is dismissal?');
    expect(replies).toHaveLength(2);
    expect(String(replies[0].created_at) < String(replies[1].created_at)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Who answers, and when it must NOT answer
// ---------------------------------------------------------------------------

describe('the responder', () => {
  it('is the other participant in a DM', () => {
    const { store } = armed();
    const { replies } = exchange(store, DEMO_DM_CONVERSATION_ID, 'quick question');
    expect(replies).toHaveLength(1);
    expect(replies[0].sender_id).toBe(TOM_ID);
  });

  it('rotates between the other parents in a group', () => {
    const { store } = armed();
    const senders = ['first', 'second', 'third'].map(
      (m) => exchange(store, DEMO_GROUP_CONVERSATION_ID, m).replies[0].sender_id,
    );
    expect(new Set(senders).size).toBe(3);
    expect(senders).not.toContain(PRESENTER_ID);
  });

  it('never answers a non-presenter message (that would loop)', () => {
    const { store } = armed();
    const before = store.readTable('messages').length;
    store.insertRows('messages', [
      { conversation_id: DEMO_GROUP_CONVERSATION_ID, sender_id: TOM_ID, content: 'what time?' },
    ]);
    jest.advanceTimersByTime(FULL_EXCHANGE_MS);
    expect(store.readTable('messages')).toHaveLength(before + 1);
  });

  it('debounces rapid typing into a single reply', () => {
    const { store } = armed();
    const before = store.readTable('messages').length;
    for (const content of ['wait', 'no', 'sounds good']) {
      store.insertRows('messages', [
        { conversation_id: DEMO_GROUP_CONVERSATION_ID, sender_id: PRESENTER_ID, content },
      ]);
      jest.advanceTimersByTime(50);
    }
    jest.advanceTimersByTime(FULL_EXCHANGE_MS);
    const added = store.readTable('messages').slice(before);
    const replies = added.filter((r) => r.sender_id !== PRESENTER_ID);
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toBe('Perfect — see you then.');
  });
});

// ---------------------------------------------------------------------------
// The typing indicator
// ---------------------------------------------------------------------------

describe('typing indicator', () => {
  it('shows before the bubble and is gone by the time it lands', () => {
    const { store, script } = armed();
    const seen: boolean[] = [];
    const off = script.onDemoTyping(DEMO_GROUP_CONVERSATION_ID, (t) => seen.push(t));
    expect(seen).toEqual([false]); // pushes the current value on subscribe

    store.insertRows('messages', [
      { conversation_id: DEMO_GROUP_CONVERSATION_ID, sender_id: PRESENTER_ID, content: 'hello' },
    ]);
    jest.advanceTimersByTime(DEMO_BOT_THINK_MS + 1);
    expect(seen[seen.length - 1]).toBe(true);
    expect(store.readTable('messages').some((m) => m.content === "I'm good, thanks — when should we carpool?")).toBe(
      false,
    );

    jest.advanceTimersByTime(DEMO_BOT_TYPING_MS + 1);
    expect(seen[seen.length - 1]).toBe(false);
    expect(store.readTable('messages').some((m) => m.content === "I'm good, thanks — when should we carpool?")).toBe(
      true,
    );

    off();
  });

  it('stops notifying after unsubscribe', () => {
    const { store, script } = armed();
    const seen: boolean[] = [];
    const off = script.onDemoTyping(DEMO_GROUP_CONVERSATION_ID, (t) => seen.push(t));
    off();
    store.insertRows('messages', [
      { conversation_id: DEMO_GROUP_CONVERSATION_ID, sender_id: PRESENTER_ID, content: 'hello' },
    ]);
    jest.advanceTimersByTime(FULL_EXCHANGE_MS);
    expect(seen).toEqual([false]);
  });
});
