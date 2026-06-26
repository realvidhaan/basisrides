# BasisRide Launch Checklist

Tracks the steps to get BasisRide onto TestFlight and then the App Store. Code
items shipped on `master` are checked; the rest need your accounts/credentials.

## Gate 1 — before TestFlight goes to real BISV families

### Security & data (applied to PRODUCTION Supabase 2026-06-25 via MCP)
- [x] All 6 migrations applied (4 security + invite-code gating + reports/blocks).
- [x] Follow-up fix: revoked `generate_invite_codes` / `enforce_invite_code`
      EXECUTE from anon+authenticated (Supabase's default grant survived
      `REVOKE FROM PUBLIC`). Now service_role only.
- [x] Generated 20 launch invite codes (see below).
- [x] Verified: `validate_invite_code` → true for a real code, false for garbage;
      gating trigger present on `auth.users`; new tables RLS-on; leaky
      `hardship_passes`/`rides` SELECT restricted; `public.users` → `auth.users`
      FK is ON DELETE CASCADE (account deletion cascades the profile).
- [x] Deployed the `delete-account` Edge Function (verify_jwt on).
- [ ] **You:** post a code (or a per-family code) in **ParentSquare** — the trusted channel.
- [ ] **You:** on TestFlight, do one real signup with a code (succeeds) and one
      with no/garbage code (rejected) to confirm end-to-end.

**Launch invite codes (single-use, generated 2026-06-25):**
`9QTPV4JH ZAP52236 EJMUNNAM TUNYNAZM AVP69YYS LTV3JN5L CNB7LS8Q Z872AKFG`
`M6JY3Y8R SCUCEXVW E5YL7J9B ZVSRXW45 PE8QTG2X ZV6XXJZH TX7JNKSF X5XEGAKJ`
`8QPUKESG GTKLJFAU E5SL3RP2 A6APGGZ6`
Generate more anytime: `SELECT * FROM public.generate_invite_codes(20, 'note');` (service role / SQL editor).

### Legal
- [x] Drafts written: `legal/terms-of-service.md`, `legal/privacy-policy.md`.
- [x] Hosted (public, no-auth) via the `legal` Supabase Edge Function and wired
      into `SignupScreen.tsx`:
      - Terms: https://itfrksemudjaicksfucr.supabase.co/functions/v1/legal/terms
      - Privacy: https://itfrksemudjaicksfucr.supabase.co/functions/v1/legal/privacy
- [ ] **You:** have an attorney review the liability framing before public launch.
- [ ] Optional: front with a custom domain later, then update the two URLs.

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
