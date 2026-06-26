# BasisRide Launch Checklist

Tracks the steps to get BasisRide onto TestFlight and then the App Store. Code
items shipped on `master` are checked; the rest need your accounts/credentials.

## Gate 1 — before TestFlight goes to real BISV families

### Security & data (applied to PRODUCTION Supabase 2026-06-25 via MCP)
- [x] All 6 migrations applied (4 security + invite-code gating + reports/blocks).
- [x] Follow-up fix: revoked `generate_invite_codes` / `enforce_invite_code`
      EXECUTE from anon+authenticated (Supabase's default grant survived
      `REVOKE FROM PUBLIC`). Now service_role only.
- [x] Switched to ONE REUSABLE code (migration 20260626040000). A code is valid
      while `active=true` and works for unlimited signups; rotate if it leaks.
      The old single-use codes were deactivated.
- [x] Verified: only 1 active code; `validate_invite_code` true for it (case-
      insensitive), false for retired codes; gating trigger present on
      `auth.users`; new tables RLS-on; leaky `hardship_passes`/`rides` SELECT
      restricted; `public.users` → `auth.users` FK is ON DELETE CASCADE.
- [x] Deployed the `delete-account` Edge Function (verify_jwt on).
- [ ] **You:** post the active code in **ParentSquare** — the trusted channel.
- [ ] **You:** on TestFlight, sign up with the code (succeeds) and with a
      garbage code (rejected) to confirm end-to-end.

**Active reusable invite code (generated 2026-06-26):** `64WUQHE3`

Managing the code (service role / SQL editor — these are locked to service_role):
- Pick a memorable code: `SELECT public.set_invite_code('BISVFALL2026', 'note');`
- Rotate after a leak (random): `SELECT public.rotate_invite_code('rotated');`
Both deactivate all others so exactly one code is ever live.

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

### Getting from "no Apple account" to TestFlight (do these in order)

**1. Enroll in the Apple Developer Program** — https://developer.apple.com/programs/enroll/
   - $99/year. Sign in with your Apple ID; enroll as an **Individual** (fastest).
   - Apple may take a few hours to ~2 days to verify identity. You can't build a
     submittable iOS app until this is active.

**2. Build the iOS app with EAS** (EAS manages all signing — no Xcode needed):
   - `npx expo-doctor` (fix anything it flags)
   - `eas build --platform ios --profile production`
   - First run prompts you to log in to Apple; EAS auto-creates the App ID,
     distribution certificate, and provisioning profile. Just say yes.

**3. Create an App Store Connect API key** (cleaner than Apple-ID + password) —
   App Store Connect → Users and Access → Integrations → keys → generate, role
   "App Manager". Note the Key ID, Issuer ID, and download the .p8 once.

**4. Submit to TestFlight:**
   - `eas submit --platform ios --profile production` — it can create the
     App Store Connect app record and upload the build. Provide the API key from
     step 3 when prompted (or add `ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId`
     to `eas.json` → `submit.production.ios`).
   - The build appears in TestFlight after ~5–15 min of Apple processing.

**5. In App Store Connect, before inviting external testers:**
   - [ ] **App Privacy** questionnaire — declare accurately: precise **Location**,
         **Name**, child's name (Other Data), home **Address** (Sensitive Info or
         Contact Info), **Email**, **User Content** (messages), **Diagnostics**.
         The `.xcprivacy` manifest stays as-is; this is the separate ASC labels.
   - [ ] **Age rating** — answer the questionnaire honestly. With report/block +
         the EULA shipped you can justify a lower rating than the 17+ default for
         unmoderated chat. Do **NOT** use the Kids category.
   - [ ] **Privacy Policy URL** (Terms can go in App Description / EULA):
         `https://itfrksemudjaicksfucr.supabase.co/functions/v1/legal/privacy`
   - [ ] Add yourself + a few BISV parents as **TestFlight testers**.

**6. Smoke-test on a real device** (not the simulator): invite-code signup →
   schedule → match → live trip (map + 911 + share) → message → report/block →
   delete account.

Note: an Apple ID + the free tier lets you run a dev build on your own device,
but **TestFlight and the App Store require the paid Developer Program** (step 1).

## Post-launch
- [ ] `npm audit` — resolve the 3 moderate Dependabot advisories.
- [ ] SDK upgrade 54 → 55 → 56, incrementally, verified on device each step.
- [ ] Rate-limit `email_exists` / signup; add audit logging; ratings; support center.
- [ ] Live read-only web view for "share trip status" (currently shares text).
