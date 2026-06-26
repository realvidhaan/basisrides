# BasisRide Launch Checklist

Tracks the steps to get BasisRide onto TestFlight and then the App Store. Code
items shipped on `master` are checked; the rest need your accounts/credentials.

## Gate 1 — before TestFlight goes to real BISV families

### Security & data (apply to PRODUCTION Supabase — needs your access)
These migrations exist in `supabase/migrations/` but are **not yet live**. Apply
them in the Supabase SQL editor (per memory note, the MCP connector lacks scope),
in this order, then verify:

1. `20260622223701_restrict_hardship_passes_select.sql`
2. `20260622223702_restrict_rides_select.sql`
3. `20260622223703_enforce_messages_conversation_membership.sql`
4. `20260622223704_enforce_write_with_checks.sql`
5. `20260625090000_invite_code_gating.sql`  ← critical account gate
6. `20260625091000_reports_and_blocks.sql`  ← report/block tables

Then:
- [ ] Generate launch invite codes: `SELECT * FROM public.generate_invite_codes(20, 'TestFlight batch');`
- [ ] Post codes (or a per-family code) in **ParentSquare** — that's the trusted channel.
- [ ] Verify: a signup with **no/invalid code is rejected** (test the create-account
      function directly, not just the UI). Confirm an allowed code signs up cleanly.
- [ ] Verify live policies: `SELECT * FROM pg_policies WHERE tablename IN
      ('hardship_passes','rides','messages','reports','blocks');`
- [ ] Confirm cascade for account deletion: `SELECT conname, confdeltype FROM
      pg_constraint WHERE confrelid='public.users'::regclass;` (`c` = cascade).
      If app tables don't cascade from `public.users`, add a cleanup before relying on delete.
- [x] Deploy the `delete-account` Edge Function: `supabase functions deploy delete-account`.

### Legal (needs hosting + attorney review)
- [x] Drafts written: `legal/terms-of-service.md`, `legal/privacy-policy.md`.
- [ ] Have an attorney review (especially the liability framing).
- [ ] Host both at public URLs; update `TERMS_URL` / `PRIVACY_URL` in `SignupScreen.tsx`.

### Analytics (pick a provider)
- [x] Provider-agnostic `lib/analytics.ts` + funnel call sites (`signup_completed`,
      `trip_completed`) shipping to Sentry breadcrumbs.
- [ ] Choose PostHog or Amplitude, add the SDK + key, forward `track`/`identify`
      in `lib/analytics.ts`. Everything else keeps working.

## Gate 2 — during TestFlight, before public App Store submit

### Code (shipped)
- [x] In-app account deletion (Profile → Delete account).
- [x] Report + block on chat (long-press a message).
- [x] Emergency 911 + share status on the live trip screen.

### App Store Connect (needs your Apple Developer account)
- [ ] Fill the **App Privacy** questionnaire accurately: precise location,
      name, child name (other data), home address, email, user content
      (messages), diagnostics. The `.xcprivacy` manifest stays as-is; this is
      the App Store Connect labels.
- [ ] Set the age rating (with report/block shipped you can justify a lower
      rating than the 17+ unmoderated-chat default). Do **not** use the Kids category.
- [ ] Add Privacy Policy + Terms (Support URL) links to the listing.
- [ ] Populate `eas.json` → `submit.production.ios`: `appleId`, `ascAppId`, `teamId`
      (or pass via `eas submit` flags).
- [ ] `npx expo-doctor` clean → `eas build -p ios --profile production` → `eas submit`.
- [ ] Smoke-test the full flow on a **real device**: invite-code signup → schedule
      → match → live trip (map + 911 + share) → message → report/block → delete account.

## Post-launch
- [ ] `npm audit` — resolve the 3 moderate Dependabot advisories.
- [ ] SDK upgrade 54 → 55 → 56, incrementally, verified on device each step.
- [ ] Rate-limit `email_exists` / signup; add audit logging; ratings; support center.
- [ ] Live read-only web view for "share trip status" (currently shares text).
