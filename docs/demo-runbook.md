# Demo runbook

Everything needed to give the Ridr demo, in order. Written from an actual
end-to-end run on an iPhone 17 Pro simulator, so the surprises below are ones
that really happened, not ones that might.

## Start it

```
npm run demo
```

That is `EXPO_PUBLIC_DEMO_MODE=1 EXPO_GO=1 expo start --tunnel --go --clear`.

- **`--clear` is not optional.** Metro's transform cache does not key on
  `EXPO_PUBLIC_*` values, so without it you can get the previous run's setting —
  in either direction. A demo bundle that silently starts in production mode, or
  a production bundle with fixtures in it, both begin the same way: looking fine.
- **`EXPO_GO=1` matters too.** It drops `runtimeVersion` from the manifest
  (`app.config.js`), which is what lets Expo Go accept the project at all.
- `npm start` is the real app. It is unchanged and still talks to production
  Supabase.

The demo needs **no network**. It is an in-memory backend, so venue wifi is not
a risk — but the *packager* still has to reach your phone, so keep the laptop and
phone on the same network (or use the tunnel, which `npm run demo` already does).

## Pre-flight, once, before you present

1. Launch the app and **tap "Allow"** on the notification permission prompt. It
   appears right after the first sign-in and is needed for the two ambient
   banners. Grant it once and it will not come back.
2. Sign in once so iOS raises **"Save Password?"** and you can dismiss it with
   "Not Now". It is a keychain prompt, not the app.
3. In the Expo Go dev menu (shake, or `⌘D`), **turn off Fast Refresh**. The demo
   store is in memory: a reload wipes every message you sent, every schedule edit
   and the session.
4. Do a full dry run. It takes about four minutes.

## The walkthrough

### 1. Signup — the security beat

Tap **Register**. Every field is already filled: Robert Calder, child Ava, 9th
grade, San Jose, a real address, a silver Honda Odyssey with plate `7XKR482`.

Scroll to the bottom and tap **Create account**. It is **rejected**:

> Use your school-issued email (name@district.school.edu). Personal addresses
> aren't accepted.

Edit the email to `robert.calder@district.school.edu` and submit again.

- **The error banner scrolls the form back to the top**, so you have to scroll
  down again before the second tap. Expect it.
- If a judge asks how this works in the real app, the honest answer is: production
  gates signup on a **reusable invite code** posted to ParentSquare, not on an
  email domain. Both enforce "only this school gets in"; the demo shows a version
  that reads in one beat.

### 2. Schedule — the matching engine

You land on the Schedule tab. Two things to point at:

- The **impact strip** — miles saved, CO₂ avoided, rides shared.
- The calendar opens on an **ordinary school day**, deliberately skipping
  early-dismissal days. On those, `lib/pairing.ts` forces every pickup to 1:00 PM
  and your chosen time would look ignored.

Your own schedule starts **empty**, on purpose, so you can build it live:

**Edit Schedule** → toggle a weekday on → set a pickup time → tick **I can drive**
→ back.

This is the strongest thing in the demo, so say what it is: the fixture families
are not holding a canned answer. Their pickup times are generated from *your*
chosen time, and the real rotation engine — zone clustering, a 30-minute pickup
window, fewest-drives-first fairness, block-aware seating — runs on device and
computes the car. Change the time and it recomputes.

**The "I can drive" toggle is your driver/rider switch:**
- ticked → *"You're driving"*, with three riders listed
- unticked → *"You're being picked up"*, with Jenna's car and plate on the card

There will always be exactly three riders and one driver, either way.

Realtime refetch is debounced ~800 ms, so give the card a beat rather than
tapping twice.

### 3. Live trip

Open the day card → **Open live trip**.

The map shows the school, three rider homes, and your car. Scroll down slightly —
**"Start ride" sits behind the tab bar until you do** — and tap it.

The car drives a real 12.6 km OSRM road route in about 10 seconds, leaving a
crimson trail. As it passes each home, tap that rider's circle to check them off:
the header counts **"Riders · 2 of 3 picked up"**. On arrival the route turns
green, you get a success haptic, and the banner reads *"Arrived — everyone
dropped off"*.

### 4. Messages

Messages tab → **Tom Okafor**.

Type `hello how are you`. A typing indicator appears, then:

> I'm good, thanks — when should we carpool?

Follow with something like `can we do 3:15 tomorrow?` and then `thanks`. Each
turn is about two seconds, so a three-turn exchange lands in 5–10 seconds.

Lines that land well, and what comes back:

| You type | Reply |
|---|---|
| `hi` / `hey` / `hello` | Hey! Are we still on for pickup this week? |
| `how are you doing` | I'm good, thanks — when should we carpool? |
| `when should we carpool` | Dismissal is 3:15 — does that work for you? (+ a second bubble) |
| `does 3:15 work?` | That time works for me — I'll be at the front circle. |
| `can you drive Wednesday` | Either way works — I can drive, or happily ride along. |
| `I'm stuck in traffic` | No rush — we'll wait by the front circle. |
| `Ava is sick` | No problem — I can cover that day. |
| `thanks` | Anytime! See you at pickup. |

Anything unscripted still gets an answer — the fallbacks are deliberate
acknowledgements ("Got it — thanks for the heads up") that stay coherent against
any input. But the scripted lines above are the ones that sound like a real
conversation, so prefer those.

### 5. Ambient notifications

Two real iOS banners fire on their own:

1. **~8 s after you land on the Schedule screen** — a cover request from Tom.
   Nothing is pre-seeded on the swap board, so this is visibly an *arrival*: a
   banner drops, the ⇄ badge goes **0 → 1**, the bell goes **0 → 1**, and the
   board gains a row that was not there a moment ago. Worth pausing for — it is
   the clearest "this app is live" moment in the demo.
2. **just after the drive completes** — trip complete.

Both timings live in `lib/demoMode.ts` if you want them elsewhere. If you want
beat 1 later — say you plan to talk over the calendar first — raise
`DEMO_AMBIENT_SWAP_MS`. It is measured from sign-in, which is the same instant
the app switches to the Schedule screen.

### 6. Anything else worth showing

- **Swap board** (the ⇄ icon) — open cover requests, and "I'll cover this drive".
- **Notifications** (the bell) — the feed, with unread state.
- **Profile** — the full account, zone badge, and in-app account deletion.
- **Long-press a message from someone else** — report / block. Real Apple
  compliance work, and worth a sentence to judges.

## If something goes wrong

| Symptom | Cause / fix |
|---|---|
| App opens to a chooser ("Development Build / Expo Go") | Expected in Expo Go; tap **Expo Go**. |
| Everything is blank but there is no error | Almost always a stale Metro cache. Restart with `npm run demo` (it passes `--clear`). |
| Schedule says "No match yet" | You are on a day nobody else is in. Pick a weekday. |
| Pickup time shows 1:00 PM | You navigated to an early-dismissal day. `pairing.ts` overrides those; pick another day. |
| Sent messages/schedule vanished | The app reloaded. The store is in memory. Turn off Fast Refresh. |
| Notification banners never appear | Permission was denied. Settings → Expo Go → Notifications. |

## What is real vs. substituted

Worth being straight about if asked:

**Real, running exactly as in production:** the matching engine, the school
calendar, zone logic, the chat send/receive path and its realtime handler, the
map and route animation, the impact maths, pickup check-off, report/block.

**Substituted for the demo:** the database rows (in-memory instead of Supabase),
the signup gate (school email domain instead of an invite code), the driver's GPS
(a synthetic drive along a real route), and the other parent's chat replies (a
keyword script).
