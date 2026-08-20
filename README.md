# Ridr

**[ridrapp.vercel.app](https://ridrapp.vercel.app)** — web build

Carpooling is usually arranged over text with no real way to confirm who's actually
driving and no visibility once the car pulls away. Ridr fixes that by verifying every
parent and student inside their own school's community, so rides only ever happen with
people you already trust — parents can split driving days instead of doing it alone,
and fewer cars showing up at pickup means less gas burned and less CO₂ in the air.

Each school gets its own verified community. Parents set which days they can drive, and
the app matches them with other families on the same schedule — so pickups get split,
not carried by one parent every day.

## Tech stack

- **React Native + Expo** (`~54.0.0`), TypeScript, NativeWind/Tailwind for styling
- **Supabase** for auth, database, storage, and edge functions (`supabase/`)
- **React Navigation** (stack + bottom tabs)
- **Sentry** for error monitoring
- **Jest** + Testing Library for tests, with mocked RLS/scheduling/demo coverage

## Getting started

```bash
npm install
npm start          # production app — talks to real Supabase
```

Other useful scripts (see `package.json`):

```bash
npm run demo        # in-memory demo mode, no backend needed — see docs/demo-runbook.md
npm run ios         # native iOS build via expo run:ios
npm run android      # native Android build via expo run:android
npm run web         # web build
npm test            # run the mocked/demo test suite
npm run test:live   # live RLS probe against a real Supabase project (needs env vars)
```

Read `docs/demo-runbook.md` before giving a live demo — it walks through the full
signup → schedule → live trip → messages flow and calls out the exact gotchas from a
real run.

## Project structure

```
screens/        # top-level app screens (auth, schedule, live trip, messages, profile, swaps)
components/     # shared UI, map, and legal components
lib/            # matching/pairing engine, Supabase client, push notifications, demo backend
hooks/          # shared React hooks
constants/      # theme tokens (colors, typography)
supabase/       # migrations, edge functions, and local config
legal/          # privacy policy and terms of service
docs/           # demo runbook, architecture notes, launch checklist
security-audit/ # RLS and security review artifacts
__tests__/      # Jest test suite
```

## Security & privacy

Every school is a verified, isolated community — Row Level Security policies enforce
that rides, schedules, and messages are only visible within a rider's own school. See
`security-audit/` and `legal/privacy-policy.md` for details.
