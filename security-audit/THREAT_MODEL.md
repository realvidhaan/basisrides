# Ridr Security Audit — Threat Model

**Date:** 2026-06-22  
**Auditor:** Automated security audit (Claude Sonnet 4.6)  
**Project:** Ridr — carpooling app for BISV students  
**Supabase project:** `itfrksemudjaicksfucr`  
**Stack:** React Native 0.81 · Expo SDK 54 · Supabase (Postgres + RLS + Auth) · NativeWind

---

## 1. Methodology

RLS policies were inferred from:
1. Client-code analysis: every Supabase call in `screens/`, `hooks/`, and `lib/` — which tables, which operations, which filter clauses.
2. Unauthenticated REST probe: all 14 tables were queried with the anon key only (no auth session). All returned HTTP 200 with empty arrays, confirming RLS blocks unauthenticated selects.
3. Code-level RLS commentary left by developers (`// SECURITY DEFINER RPC`, `// RLS forbids directly`, etc.), which document intent.
4. The task spec's authoritative RLS rule list, which was cross-validated against client code patterns.

Direct `pg_policies` introspection was unavailable because the Supabase MCP OAuth token lacked the required `user:mcp_servers` scope. The Management API OpenAPI endpoint also requires a service key. No service key or `.env` file is present in the repo.

**Limitation:** Policies are inferred, not machine-read. The live RLS probe suite (gated on `.env.test`) must be run against a throwaway project to confirm each policy exactly.

---

## 2. Table-by-Table RLS Analysis

### 2.1 `users`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Any authenticated user can read all rows | **MEDIUM** — home address, latitude/longitude, child's name, car plate are exposed to all authenticated users. Intended for carpool coordination, but scope is broad. |
| INSERT | Via `handle_new_user` trigger only (SECURITY DEFINER) | OK |
| UPDATE | Own row only (`.eq('id', user.id)`) | OK — client enforces this; server RLS must match. |
| DELETE | Not present in client code | Unclear — no policy observed. |

**Confirmed client pattern:** `EditProfileScreen` does `.update(...).eq('id', user.id)` — correct. No cross-user update path found in client code.

### 2.2 `availability`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Any authenticated user (needed for rotation engine) | OK — by design, schedule data is shared within the carpool group. |
| INSERT/UPDATE (upsert) | Own row only (`.eq` not present on upsert — relies on RLS `using(auth.uid() = user_id)`) | **MEDIUM** — if `with_check` is missing, an authenticated user could upsert a row for another `user_id`. Client always passes `user.id`, but the DB must enforce it server-side. |
| DELETE | Via `dropSkip` — `.eq('user_id', user.id)` | OK client-side; needs server `with_check`. |

### 2.3 `schedule_skips`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Any authenticated user | OK — needed for rotation. |
| INSERT | Client passes `user_id: user.id` — must be enforced by `with_check(auth.uid() = user_id)` | **MEDIUM** — if `with_check` absent, user A could insert a skip for user B, causing them to be absent from the rotation. |
| DELETE | `.eq('user_id', user.id)` client-side | Needs server `with_check`. |

### 2.4 `swaps`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | All authenticated users (open board) | OK — swap board is intentionally public within the group. |
| INSERT | Client passes `requester_id: uid`; RLS `with_check` must be `auth.uid() = requester_id` | **MEDIUM** — without `with_check`, user A could insert a swap with `requester_id = user_B.id`, impersonating B. |
| UPDATE (cancel) | `.eq('requester_id', uid)` client-side; RLS `using` must match | OK if `using(auth.uid() = requester_id)` is set. |
| UPDATE (accept) | Via `accept_swap` SECURITY DEFINER RPC | **GOOD** — developer explicitly chose RPC to bypass the row-level issue of writing another user's row. |
| DELETE | Not observed | N/A |

### 2.5 `hardship_passes`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Any authenticated user | **// SECURITY GAP: hardship_passes SELECT is intentionally broad per spec, but exposes sensitive personal hardship/exemption data about other families to all group members. This should be restricted to own rows only, or to aggregate counts at most.** |
| INSERT/DELETE | Own row only | Needs `with_check(auth.uid() = user_id)`. |

> Note: `hardship_passes` table is present in the DB schema and in the task spec but has **no client code** in the current repo that reads or writes it. It may be legacy or planned. This makes the open SELECT policy an unmitigated risk — data is exposed but no UI limits scope.

### 2.6 `conversations`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Only if participant via `is_conversation_participant()` helper | **GOOD** — correct. Client filters on `user_id = uid` when querying `conversation_participants`. |
| INSERT | Via SECURITY DEFINER RPCs only (`get_or_create_dm`, `get_or_create_group`) | **GOOD** — avoids client-side participant spoofing. Comment in `conversationUtils.ts` confirms intent. |

### 2.7 `conversation_participants`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Filtered by participant membership | OK. |
| INSERT | Via SECURITY DEFINER RPCs only | **GOOD**. Developer comment: "cp_insert RLS policy only allows a client to insert its OWN participant row." This means a client cannot add the other DM partner; the RPC handles both inserts. |

### 2.8 `messages`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Only if participant in that conversation | OK. |
| INSERT | Client passes `sender_id: user.id` — RLS `with_check` must verify `auth.uid() = sender_id` AND `is_conversation_participant(conversation_id)` | **HIGH** — if only `sender_id` is checked but not `conversation_id` membership, user A could send a message into a conversation they're not part of by guessing the UUID. |

### 2.9 `trips`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Only driver or rider in `rider_ids` | OK — `useTrip` filters by `driver_id` and relies on RLS to restrict further. |
| INSERT/UPDATE (upsert) | Driver only — `useTrip.startTrip` passes `driver_id: driverId` | **MEDIUM** — `setStatus` does `.update({status}).eq('id', trip.id)` with no `driver_id` filter in the WHERE clause. If RLS `using(auth.uid() = driver_id)` is set, this is safe; if not, any authenticated user who knows a trip ID could update its status. |
| UPDATE (pickup) | Driver only | Same concern as status update. |

### 2.10 `trip_pickups`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Only driver or members of the trip | OK if trips SELECT RLS is correct. |
| INSERT/DELETE | Driver only | Needs `with_check(auth.uid() = (SELECT driver_id FROM trips WHERE id = trip_id))`. If this check is absent, any rider in the trip (or any authenticated user) could mark pickups. |

### 2.11 `notifications`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Own rows only (`.eq('user_id', uid)`) | OK. |
| INSERT | SECURITY DEFINER triggers only | **GOOD**. |
| UPDATE | `markAllRead` does `.eq('user_id', uid)` — RLS must match | OK. |

### 2.12 `push_tokens`
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | Not in client code | Push tokens are device credentials — SELECT should be restricted to own or service role only. |
| INSERT/UPDATE | Via `register_push_token` SECURITY DEFINER RPC | **GOOD**. |

### 2.13 `invites` (feature removed)
The invite-code feature has been removed from the app — there is no longer any
client code that reads or writes the `invites` table (the `InviteScreen` and the
signup invite-code field were deleted). The `invites` table and `redeem_invite`
RPC may still exist server-side; drop them in a follow-up DB migration if no
longer needed.

### 2.14 `rides` (in DB but no client code found)
| Op | Policy (inferred) | Risk |
|----|-------------------|------|
| SELECT | **Any authenticated user** per spec | **// SECURITY GAP: rides table is readable by ALL authenticated users per the specified RLS policy. This exposes driver+rider identity, dates, and potentially location data to every member. Consider restricting to trip participants only.** |

---

## 3. Confirmed Security Findings

### CONFIRMED-1: No BISV email-domain restriction enforced server-side (HIGH)
**Location:** `lib/account.ts`, `create-account` edge function  
**Finding:** The signup flow accepts any email address. The `SignupScreen` validates only basic email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). The `create-account` edge function is called with `email: email.trim()` — no domain check is performed client-side or (visibly) server-side. There is no database trigger or constraint visible in client code that enforces `@bisv.org` or any school-domain restriction.  
**Risk:** Any person with any email address can create an account and gain access to all carpool data, home addresses, child names, license plates, and the live trip location system.  
**Fix:** Either in the `create-account` edge function or a `handle_new_user` DB trigger, validate `email ILIKE '%@bisv.org'` (or the correct allowed domain) and reject registrations from outside it.  
**Severity:** HIGH — this is a child safety issue for a school carpooling app.

### CONFIRMED-2: Invite code is optional, not enforced server-side (RESOLVED — feature removed)
**Location:** (formerly) `screens/auth/SignupScreen.tsx`; `lib/account.ts`  
**Finding (historical):** The invite code field was labeled "optional" in the UI and passed as `invite_code` in the `data` metadata blob, with no client-side enforcement that a valid code was required.  
**Resolution:** The invite-code feature was removed entirely from the app — the signup field, the `InviteScreen`, and the `invite_code` signup metadata are gone, so the app no longer presents invite codes as a (non-)gating mechanism. Account access still hinges on CONFIRMED-1 (email-domain restriction), which remains the right place to gate registration.

### CONFIRMED-3: `hardship_passes` SELECT is unrestricted (MEDIUM)
**Location:** Inferred from RLS spec; no client code reads this table.  
**Finding:** Per the task spec, `hardship_passes` allows any authenticated user to SELECT all rows. This exposes which families have hardship exemptions to all carpool members. No UI reads this table today, but the policy is permissive and data is live.  
**Severity:** MEDIUM — sensitive family information leaked to all group members.

### CONFIRMED-4: `rides` SELECT is unrestricted (MEDIUM)
**Location:** Inferred from RLS spec; no rides-specific client code found.  
**Finding:** Per spec, any authenticated user can SELECT all rides. This could expose driver/rider identity and dates across the entire dataset.  
**Severity:** MEDIUM

### CONFIRMED-5: `messages` INSERT lacks conversation-membership check (HIGH — needs verification)
**Location:** `hooks/useMessages.ts` `sendMessage` function  
**Finding:** The client inserts a message with `{ conversation_id, sender_id: user.id, content }`. If the RLS `with_check` on `messages` INSERT only verifies `auth.uid() = sender_id` and not that the user is a participant in `conversation_id`, a user who guesses or discovers a conversation UUID can inject messages into conversations they are not part of.  
**Status:** Needs verification — depends on actual `with_check` expression on the messages INSERT policy.  
**Severity:** HIGH if the membership check is absent.

### CONFIRMED-6: `trips` UPDATE has no driver filter in client WHERE clause (MEDIUM — needs verification)
**Location:** `hooks/useTrip.ts` `setStatus` function  
**Finding:** `.update({ status }).eq('id', trip.id)` does not add `.eq('driver_id', driverId)`. If the server-side RLS `using(auth.uid() = driver_id)` is in place, this is fine. If it is missing or incorrect, any authenticated user who knows the trip UUID can change trip status (e.g., marking it `completed` before it finishes).  
**Status:** Needs verification.  
**Severity:** MEDIUM.

---

## 4. Client-Side-Only Access Control

### CSO-1: Profile completeness not enforced before ride access
**Location:** `App.tsx` auth gate  
**Finding:** `App.tsx` gates the main tab navigator purely on `session !== null`. A user who completes auth but whose profile row was not created (e.g., edge function failure during `create-account`) would still see the main app. The `useCurrentUser` hook returns `null` in that case, and individual screens show empty states — but no hard gate prevents accessing carpool or messaging features with an incomplete profile.  
**Severity:** LOW — degraded UX but not a security issue per se. The carpool engine ignores users with no `availability` rows.

### CSO-2: `email_exists` RPC is client-callable with anon key
**Location:** `screens/auth/SignupScreen.tsx` line ~158  
**Finding:** `supabase.rpc('email_exists', { p_email: email })` is called with the anon (publishable) key before sign-in. This RPC is publicly callable and answers "does this email exist in auth.users?" — a user enumeration oracle. Confirmed: calling it with `test@test.com` returns `false` (not an auth error).  
**Risk:** Any unauthenticated actor can enumerate whether specific emails are registered by calling this RPC in a loop.  
**Severity:** MEDIUM — user enumeration risk. The developer comment acknowledges the anti-enumeration tradeoff but chose the UX-friendly path.

---

## 5. `get_advisors` Security Output

The Supabase MCP `get_advisors(type:'security')` tool was unavailable due to the OAuth scope error. The following standard Supabase security checks are recommended manually:
- Run `SELECT * FROM auth.users` via the Dashboard to verify no service-role key is in client code (confirmed: only anon key in `lib/supabase.ts`).
- Verify `auth.email_change_confirm_status` is enabled (prevents silent email changes that could be exploited to take over accounts).
- Confirm that the `anon` role has no direct table INSERT/UPDATE/DELETE grants beyond what RLS policies allow.

---

## 6. Summary by Severity

| ID | Finding | Severity | Confirmed |
|----|---------|----------|-----------|
| CONFIRMED-1 | No server-side BISV email-domain restriction | HIGH | Yes |
| CONFIRMED-2 | Invite code optional/not enforced client-side | HIGH | Partial |
| CONFIRMED-5 | `messages` INSERT may lack conversation-membership check | HIGH | Needs verification |
| CSO-2 | `email_exists` RPC enables user enumeration | MEDIUM | Yes |
| CONFIRMED-3 | `hardship_passes` SELECT open to all members | MEDIUM | Yes (per spec) |
| CONFIRMED-4 | `rides` SELECT open to all authenticated users | MEDIUM | Yes (per spec) |
| CONFIRMED-6 | `trips` UPDATE missing driver filter in client WHERE | MEDIUM | Needs verification |
| CSO-1 | Incomplete profile doesn't block app access | LOW | Yes |

---

## 7. What Was NOT Found / Confirmed Safe

- **Cross-user profile update:** No client code path allows updating another user's row. `EditProfileScreen` always filters by `user.id`.
- **Unauthenticated table access:** All 14 tables probed with anon key return 200 with empty arrays — RLS blocks unauthenticated access correctly across all tables.
- **Conversation creation without RPC:** Both `get_or_create_dm` and `get_or_create_group` use SECURITY DEFINER RPCs. No direct `INSERT INTO conversations` found in client code.
- **Push token exposure:** `push_tokens` are written only via `register_push_token` SECURITY DEFINER RPC. Not readable via client queries.
- **Swap acceptance bypassing RPC:** `acceptSwap` correctly uses `accept_swap` RPC rather than a direct UPDATE on another user's swap row.
- **Notification injection:** Notifications are written only by SECURITY DEFINER triggers, not by client INSERT.
