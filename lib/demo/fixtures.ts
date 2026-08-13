/**
 * Demo mode — the fake community, as pure data.
 *
 * Everything the in-memory demo store is seeded with lives here. This module is
 * deliberately behaviour-free: no store, no client, no hooks. The dependency
 * graph is `supabase.ts -> client -> store -> fixtures`, and keeping fixtures at
 * the bottom is what stops it becoming a cycle.
 *
 * Two things in here are load-bearing and easy to break by "tidying":
 *
 *  - The presenter's UUID is all-zeros so it sorts first among the cluster.
 *    `lib/pairing.ts` breaks every tie on `userId` ascending (`:79`, `:213`), so
 *    an id that sorts first makes the engine's output deterministic.
 *  - Every `neighborhood` is the literal 'San Jose'. `lib/zones.ts` maps that to
 *    the 'San Jose' zone and `lib/pairing.ts:152` groups by zone, so any other
 *    Silicon Valley city would drop that person into 'West Valley' or
 *    'Peninsula' and the cluster would never form.
 */
import { DEMO_ROUTE } from '@/lib/demoRouteData';
import { formatMonthDay, parseISO, toISO } from '@/lib/dateUtils';
import {
  isEarlyDismissal,
  nextSchoolDay,
  schoolDayStatus,
} from '@/lib/schoolCalendar';

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

export const PRESENTER_ID = '00000000-0000-4000-8000-000000000001';
export const MARCUS_ID = 'd1000000-0000-4000-8000-000000000002';
export const PRIYA_ID = 'd2000000-0000-4000-8000-000000000003';
export const JENNA_ID = 'd3000000-0000-4000-8000-000000000004';
export const TOM_ID = 'd4000000-0000-4000-8000-000000000005';
export const RACHEL_ID = 'd5000000-0000-4000-8000-000000000006';

/** The four ids that form the daily cluster, presenter first. */
export const CLUSTER_IDS: readonly string[] = [
  PRESENTER_ID,
  MARCUS_ID,
  PRIYA_ID,
  JENNA_ID,
];

/** Domain the demo signup gate accepts. */
export const DEMO_SCHOOL_EMAIL_DOMAIN = 'basisindependent.com';

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * An ordinary in-term school day, used when the clock has run past the
 * published calendar. `nextSchoolDay` returns `from` unchanged once the year is
 * over (`lib/schoolCalendar.ts`), so on 2027-06-05 the demo would otherwise open
 * on an out-of-term date, and `lib/pairing.ts` returns an empty map for those —
 * every screen would be blank with no error to explain why. Falling back to a
 * known good day keeps the demo usable after the calendar lapses.
 */
const DEMO_FALLBACK_DATE_ISO = '2026-08-13';

/**
 * The day the demo opens on.
 *
 * Production opens on `nextSchoolDay(new Date())`. That is right for the app and
 * wrong for the demo: on an early-dismissal day `lib/pairing.ts:287-297`
 * overwrites every pickup time with 13:00 *after* clustering, so the pickup time
 * the presenter just picked on stage would be silently replaced by "1:00 PM".
 * The clustering itself is unaffected — it only looks broken — so the demo skips
 * forward to the first ordinary school day instead. The production path is
 * untouched.
 */
export function demoInitialDate(from: Date = new Date()): Date {
  let cursor = nextSchoolDay(from);
  // Bounded: the published calendar never has more than four consecutive
  // early-dismissal days (Term Project Week), and nextSchoolDay itself clamps to
  // the school year, so this terminates well inside the guard.
  for (let i = 0; i < 30 && isEarlyDismissal(cursor); i += 1) {
    const next = startOfDay(cursor);
    next.setDate(next.getDate() + 1);
    cursor = nextSchoolDay(next);
  }
  // Outside the published year nextSchoolDay is the identity, so the loop above
  // cannot rescue us and `cursor` is still a blocked day.
  if (schoolDayStatus(cursor).blocked) return parseISO(DEMO_FALLBACK_DATE_ISO);
  return cursor;
}

const INITIAL_DATE = demoInitialDate();

/** ISO of the day the demo opens on — the group chat's `ride_date`. */
export const DEMO_INITIAL_ISO = toISO(INITIAL_DATE);

/** Matches `lib/conversationUtils.ts:54` so the seeded group is the one the RPC finds. */
export const DEMO_GROUP_TITLE = `Carpool · ${formatMonthDay(INITIAL_DATE)}`;

/** The next Thursday strictly after today — the day Rachel needs covered. */
function nextThursdayISO(from: Date): string {
  const cursor = startOfDay(from);
  do {
    cursor.setDate(cursor.getDate() + 1);
  } while (cursor.getDay() !== 4);
  return toISO(cursor);
}

const RACHEL_SWAP_DAY = nextThursdayISO(new Date());

/** The next Monday strictly after today — the day the ambient beat asks about. */
function nextMondayISO(from: Date): string {
  const cursor = startOfDay(from);
  do {
    cursor.setDate(cursor.getDate() + 1);
  } while (cursor.getDay() !== 1);
  return toISO(cursor);
}

const TOM_SWAP_DAY = nextMondayISO(new Date());

/**
 * The `count` weekdays before `from` that school was open on.
 *
 * `schoolDayStatus` also blocks everything outside the published school year and
 * labels it 'Summer'. On 2026-08-12 — the first day of the 2026-27 year — that
 * is *every* prior day, so gating on `blocked` alone would seed zero completed
 * trips and leave the impact strip empty on exactly the date the demo is most
 * likely to be given. Real closures (breaks, holidays) are still skipped.
 */
function previousSchoolDays(from: Date, count: number): string[] {
  const out: string[] = [];
  const cursor = startOfDay(from);
  for (let guard = 0; out.length < count && guard < 120; guard += 1) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) continue;
    const status = schoolDayStatus(cursor);
    if (status.blocked && status.label !== 'Summer') continue;
    out.push(toISO(cursor));
  }
  return out.reverse(); // oldest first
}

const PAST_TRIP_DAYS = previousSchoolDays(INITIAL_DATE, 6);

/** A timestamp at a local wall-clock time on an ISO date. */
function at(iso: string, hh: number, mm: number): string {
  const d = parseISO(iso);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const ACCOUNT_CREATED_AT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

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

/**
 * Home coordinates are read off the real driven polyline rather than typed in,
 * so a regenerated route keeps every pin exactly on the line the car follows.
 * Indices are the `DEMO_STOPS` vertices plus 120 (Meridian Ave) for Marcus —
 * `DEMO_STOPS` names only three homes and the cluster has four people, and 120
 * sits on the longest stop-free leg of the route.
 */
const at120 = DEMO_ROUTE[120];
const at205 = DEMO_ROUTE[205];
const at365 = DEMO_ROUTE[365];
const at462 = DEMO_ROUTE[462];

export const DEMO_USERS: DemoUserRow[] = [
  {
    id: PRESENTER_ID,
    full_name: 'Robert Calder',
    child_name: 'Ava Calder',
    grade: '9th',
    neighborhood: 'San Jose',
    email: `robert.calder@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
    address: '5412 Alvarado Ct, San Jose, CA 95123',
    latitude: at462.lat,
    longitude: at462.lng,
    car_capacity: 4,
    car_color: 'silver',
    car_type: 'minivan',
    car_model: 'Honda Odyssey',
    license_plate: '7XKR482',
    created_at: ACCOUNT_CREATED_AT,
    updated_at: ACCOUNT_CREATED_AT,
  },
  {
    id: MARCUS_ID,
    full_name: 'Marcus Delgado',
    child_name: 'Diego Delgado',
    grade: '7th',
    neighborhood: 'San Jose',
    email: `marcus.delgado@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
    address: '2115 Meridian Ave, San Jose, CA 95125',
    latitude: at120.lat,
    longitude: at120.lng,
    // capacity 0 is what keeps Marcus, Priya and Rachel out of the driver
    // candidate set: lib/pairing.ts:186 requires `p.capacity >= 1`.
    car_capacity: 0,
    car_color: null,
    car_type: null,
    car_model: null,
    license_plate: null,
    created_at: ACCOUNT_CREATED_AT,
    updated_at: ACCOUNT_CREATED_AT,
  },
  {
    id: PRIYA_ID,
    full_name: 'Priya Raghavan',
    child_name: 'Anika Raghavan',
    grade: '10th',
    neighborhood: 'San Jose',
    email: `priya.raghavan@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
    address: '1480 La Mirada Dr, San Jose, CA 95124',
    latitude: at205.lat,
    longitude: at205.lng,
    car_capacity: 0,
    car_color: null,
    car_type: null,
    car_model: null,
    license_plate: null,
    created_at: ACCOUNT_CREATED_AT,
    updated_at: ACCOUNT_CREATED_AT,
  },
  {
    id: JENNA_ID,
    full_name: 'Jenna Whitfield',
    child_name: 'Ellie Whitfield',
    grade: '8th',
    neighborhood: 'San Jose',
    email: `jenna.whitfield@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
    address: '3260 Dellwood Way, San Jose, CA 95123',
    latitude: at365.lat,
    longitude: at365.lng,
    car_capacity: 4,
    car_color: 'blue',
    car_type: 'minivan',
    car_model: 'Toyota Sienna',
    license_plate: '6TRJ109',
    created_at: ACCOUNT_CREATED_AT,
    updated_at: ACCOUNT_CREATED_AT,
  },
  {
    // Tom and Rachel are never in a car, so these coordinates are never pinned
    // (LiveTripScreen builds its marker list from the assignment). They exist so
    // latitude/longitude are non-null on every row.
    id: TOM_ID,
    full_name: 'Tom Okafor',
    child_name: 'Femi Okafor',
    grade: '11th',
    neighborhood: 'San Jose',
    email: `tom.okafor@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
    address: '1032 Foxworthy Ave, San Jose, CA 95118',
    latitude: 37.2762,
    longitude: -121.9012,
    car_capacity: 5,
    car_color: 'gray',
    car_type: 'suv',
    car_model: 'Honda CR-V',
    license_plate: '8CWL356',
    created_at: ACCOUNT_CREATED_AT,
    updated_at: ACCOUNT_CREATED_AT,
  },
  {
    id: RACHEL_ID,
    full_name: 'Rachel Kim',
    child_name: 'Soo-jin Kim',
    grade: '6th',
    neighborhood: 'San Jose',
    email: `rachel.kim@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
    address: '877 Hillsdale Ave, San Jose, CA 95136',
    latitude: 37.2698,
    longitude: -121.8688,
    car_capacity: 0,
    car_color: null,
    car_type: null,
    car_model: null,
    license_plate: null,
    created_at: ACCOUNT_CREATED_AT,
    updated_at: ACCOUNT_CREATED_AT,
  },
];

// ---------------------------------------------------------------------------
// Seeded rows
// ---------------------------------------------------------------------------

/** Fixed ids so a reseed produces byte-identical rows (handy in tests). */
export const DEMO_GROUP_CONVERSATION_ID = 'c0000000-0000-4000-8000-000000000001';
export const DEMO_DM_CONVERSATION_ID = 'c0000000-0000-4000-8000-000000000002';

const YESTERDAY_ISO = PAST_TRIP_DAYS[PAST_TRIP_DAYS.length - 1];

const conversations: Record<string, unknown>[] = [
  {
    id: DEMO_GROUP_CONVERSATION_ID,
    type: 'group',
    ride_date: DEMO_INITIAL_ISO,
    title: DEMO_GROUP_TITLE,
    created_at: at(YESTERDAY_ISO, 15, 30),
  },
  {
    id: DEMO_DM_CONVERSATION_ID,
    type: 'dm',
    ride_date: null,
    title: null,
    created_at: at(YESTERDAY_ISO, 9, 5),
  },
];

const conversationParticipants: Record<string, unknown>[] = [
  ...CLUSTER_IDS.map((uid) => ({
    conversation_id: DEMO_GROUP_CONVERSATION_ID,
    user_id: uid,
    // The presenter has "read" the group up to just before Jenna's last line, so
    // exactly one message is unread and the tab badge shows 1.
    last_read_at: uid === PRESENTER_ID ? at(YESTERDAY_ISO, 15, 41) : null,
  })),
  { conversation_id: DEMO_DM_CONVERSATION_ID, user_id: PRESENTER_ID, last_read_at: at(YESTERDAY_ISO, 9, 20) },
  { conversation_id: DEMO_DM_CONVERSATION_ID, user_id: TOM_ID, last_read_at: null },
];

const messages: Record<string, unknown>[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    conversation_id: DEMO_GROUP_CONVERSATION_ID,
    sender_id: PRIYA_ID,
    content: 'Anika has orchestra until 3:30 today, sorry for the late pickup!',
    created_at: at(YESTERDAY_ISO, 15, 36),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    conversation_id: DEMO_GROUP_CONVERSATION_ID,
    sender_id: MARCUS_ID,
    content: 'No problem — Diego will wait by the front circle.',
    created_at: at(YESTERDAY_ISO, 15, 39),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    conversation_id: DEMO_GROUP_CONVERSATION_ID,
    sender_id: JENNA_ID,
    content: 'Thanks both. See everyone tomorrow!',
    created_at: at(YESTERDAY_ISO, 15, 44),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000004',
    conversation_id: DEMO_DM_CONVERSATION_ID,
    sender_id: TOM_ID,
    content: 'Hey Robert — are you still doing the Thursday run this month?',
    created_at: at(YESTERDAY_ISO, 9, 12),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005',
    conversation_id: DEMO_DM_CONVERSATION_ID,
    sender_id: PRESENTER_ID,
    content: 'Planning on it. I will let you know if anything changes.',
    created_at: at(YESTERDAY_ISO, 9, 18),
  },
];

/**
 * Six finished drives, alternating between the presenter and Jenna, each
 * carrying the other three cluster members. The impact strip reads miles off
 * these with `haversineMeters` against `SCHOOL.point`.
 */
const trips: Record<string, unknown>[] = PAST_TRIP_DAYS.map((iso, i) => {
  const driverId = i % 2 === 0 ? PRESENTER_ID : JENNA_ID;
  return {
    id: `a0000000-0000-4000-8000-00000000000${i + 1}`,
    driver_id: driverId,
    ride_date: iso,
    rider_ids: CLUSTER_IDS.filter((id) => id !== driverId),
    status: 'completed',
    started_at: at(iso, 15, 25),
    updated_at: at(iso, 16, 5),
  };
});

const swaps: Record<string, unknown>[] = [
  {
    // Invisible to useCarpool (that query filters `.eq('status','filled')`) but
    // visible on the swap board, which is where the demo uses it.
    id: 'f0000000-0000-4000-8000-000000000001',
    requester_id: RACHEL_ID,
    day: RACHEL_SWAP_DAY,
    note: 'Dentist appointment — can anyone cover?',
    status: 'open',
    accepted_by: null,
    created_at: at(YESTERDAY_ISO, 11, 2),
  },
];

/**
 * The cover request that lands mid-demo (ambient beat 1, `lib/demo/script.ts`).
 *
 * Deliberately NOT Rachel, whom the plan names for this beat: she already holds
 * the seeded open request above, and a second row from the same parent reads as
 * a duplicate on the swap board rather than as news. Tom is the presenter's DM
 * partner and has a car (`car_capacity: 5`), so a parent who normally drives
 * asking for cover is the plausible version of this beat.
 *
 * Monday, so it cannot land on Rachel's Thursday and read as the same request.
 */
export const DEMO_AMBIENT_SWAP: {
  requesterId: string;
  requesterName: string;
  day: string;
  dayLabel: string;
  note: string;
} = {
  requesterId: TOM_ID,
  // Read off the user row rather than retyped, so a renamed fixture cannot make
  // the banner and the swap board disagree about who is asking.
  requesterName: DEMO_USERS.find((u) => u.id === TOM_ID)!.full_name,
  day: TOM_SWAP_DAY,
  dayLabel: formatMonthDay(parseISO(TOM_SWAP_DAY)),
  note: 'Meeting runs late downtown — can anyone cover pickup?',
};

const notifications: Record<string, unknown>[] = [
  {
    // `data` keys must match usePushRegistration's routeFromData and
    // NotificationsScreen.handlePress, or tapping the row goes nowhere.
    id: 'b0000000-0000-4000-8000-000000000001',
    user_id: PRESENTER_ID,
    type: 'message',
    title: 'Jenna Whitfield',
    body: 'Thanks both. See everyone tomorrow!',
    data: {
      conversation_id: DEMO_GROUP_CONVERSATION_ID,
      conversation_title: DEMO_GROUP_TITLE,
    },
    read_at: null,
    created_at: at(YESTERDAY_ISO, 15, 44),
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    user_id: PRESENTER_ID,
    type: 'trip',
    title: 'Trip complete',
    body: 'Everyone was dropped off safely.',
    data: { ride_date: YESTERDAY_ISO },
    read_at: at(YESTERDAY_ISO, 16, 30),
    created_at: at(YESTERDAY_ISO, 16, 6),
  },
];

/** Everything the store loads at construction, keyed by table name. */
export const SEED_TABLES: {
  users: DemoUserRow[];
  availability: Record<string, unknown>[];
  schedule_skips: Record<string, unknown>[];
  swaps: Record<string, unknown>[];
  trips: Record<string, unknown>[];
  trip_pickups: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  conversation_participants: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  blocks: Record<string, unknown>[];
  reports: Record<string, unknown>[];
} = {
  users: DEMO_USERS,
  // Empty on purpose. The presenter fills their own availability live on stage
  // and the other three parents' rows are GENERATED on read so the community
  // re-clusters around whatever time is picked — see store.companionAvailability.
  availability: [],
  schedule_skips: [],
  swaps,
  trips,
  trip_pickups: [],
  conversations,
  conversation_participants: conversationParticipants,
  messages,
  notifications,
  blocks: [],
  reports: [],
};

// ---------------------------------------------------------------------------
// Signup / login prefill
// ---------------------------------------------------------------------------

/**
 * Prefill for SignupScreen / LoginScreen.
 *
 * `coords` is seeded into the signup form's `addressCoords` so the blocking
 * `geocodeAddress` round-trip is skipped — the demo must survive airplane mode.
 */
export const DEMO_SIGNUP_PREFILL: {
  fullName: string;
  childName: string;
  grade: string;
  neighborhood: string;
  address: string;
  coords: { lat: number; lng: number };
  carCapacity: string;
  carColor: string;
  carType: string;
  carState: string;
  licensePlate: string;
  rejectedEmail: string;
  acceptedEmail: string;
  password: string;
} = {
  fullName: 'Robert Calder',
  childName: 'Ava Calder',
  grade: '9th',
  neighborhood: 'San Jose',
  address: '5412 Alvarado Ct, San Jose, CA 95123',
  coords: { lat: at462.lat, lng: at462.lng },
  carCapacity: '4',
  carColor: 'silver',
  carType: 'minivan',
  carState: 'CA',
  licensePlate: '7XKR482',
  rejectedEmail: 'robert.calder@gmail.com',
  acceptedEmail: `robert.calder@${DEMO_SCHOOL_EMAIL_DOMAIN}`,
  password: 'basisrides',
};
