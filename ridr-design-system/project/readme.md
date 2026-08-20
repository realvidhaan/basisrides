# Handoff: Ridr Design System & Mobile App

## Overview
Ridr is a rebrand of "BasisRides," a carpooling coordination app for school/neighborhood communities. This handoff removes all school-specific naming and color branding and replaces it with an original "Sunrise Teal" identity for a Congressional App Challenge submission. Scope covers the design system (tokens + components) and the 4-screen auth flow (Welcome, Login, Signup, Home).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look, layout, and behavior, not production code to copy directly. The task is to **recreate these HTML designs in the target codebase's existing environment** (the original BasisRides app is React Native/Expo/Supabase — confirm and match that stack) using its established patterns and libraries. If no environment exists yet, choose the most appropriate framework and implement there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and component states are final. Recreate pixel-perfectly using the codebase's existing component patterns, swapping in these exact values.

## Screens / Views

### 1. Welcome
- **Purpose**: App entry point; routes to Login or Signup.
- **Layout**: Full-height flex column. Status bar (44px) top. Centered content column, 32px horizontal padding, centered both axes.
- **Components**:
  - Logo mark (`assets/logo.jpg`), 92×92px, object-fit contain, 20px bottom margin.
  - Wordmark "ridr" — Sora 800, 30px, color `#1B2523`, 8px bottom margin.
  - Subhead "Community carpooling, made simple." — Inter 400, 15px, color `#55635F`, centered, 56px bottom margin.
  - Button stack, 16px gap: "Log in" (primary, teal fill) then "Sign up" (outline, dark ring).

### 2. Login
- **Purpose**: Authenticate existing users.
- **Layout**: Status bar → back button (20px top/side padding) → scrollable content (24px padding) → footer link (fixed bottom, 32px padding, centered).
- **Components**:
  - Back button: 41×41px, 12px radius, white bg, inset 1px border `#E3ECEA`, chevron-left icon.
  - Heading: "Welcome back to Ridr. Glad to see you again!" — Sora 700, 28px, line-height 1.3, letter-spacing -0.01em, 32px bottom margin.
  - Error banner (conditional): bg `#FDEEEE`, 8px radius, 12px padding, ⚠ icon + message in `#E5484D` Inter 500 14px.
  - Inputs: Email, Password (type=password), each 52px tall, 10px radius, white bg, inset border (default `#D8E4E3` 1.5px → focus `#0F8B8D` 1.5px → error `#E5484D` 1.5px), label above in Inter 500 13px.
  - Primary button "Log in": disabled until both fields filled; shows loading text while submitting (~1000ms simulated).
  - Footer text: "New to Ridr? **Sign up**" — Inter, "Sign up" in teal 700 weight, tappable.

### 3. Signup
- **Purpose**: Create a new account (parent/guardian + child info + carpool details).
- **Layout**: Status bar → header row (back button + "Create your account" title, bottom border) → scrollable form (20/24px padding) → submit button.
- **Fields** (each a labeled input, 16px vertical gap, inline error text below in red Inter 500 12px):
  - Full name (text)
  - Child's name (text)
  - Grade (select: 5th–12th)
  - Neighborhood (text)
  - Car capacity (number, 0–6, helper text "Enter 0 if you don't drive")
  - Email (email, regex-validated)
  - Password (password, min 8 chars)
  - Confirm password (must match)
- **Validation**: all fields required except car capacity may be 0; inline errors clear on edit.
- **Submit**: "Create account" primary button, loading state ~1200ms, then routes to Home.

### 4. Home
- **Purpose**: Landing screen post-auth; placeholder for ride scheduling.
- **Layout**: Status bar → centered column.
- **Components**:
  - Logo 56×56px, wordmark "ridr" Sora 800 30px, subhead as on Welcome.
  - Card: bg `#F4F9F9`, 16px radius, 24/20px padding, 40px bottom margin. Contains uppercase label "UPCOMING RIDES" (Inter 600 13px, letter-spacing 0.06em, `#7C8C8B`) and italic placeholder "Ride scheduling coming soon." (Inter 400 15px, `#55635F`).
  - "Log out" outline button, medium size (52px), routes back to Welcome.

## Interactions & Behavior
- Navigation is a simple client-side screen-state switch (welcome/login/signup/home) in the reference — implement with the codebase's actual router/navigation stack.
- Button hover: primary darkens to `#0B6B6D`; outline gets subtle bg tint `#F4F9F9`; ghost fades to 70% opacity. All transitions 150ms ease, no scale transforms.
- Input focus: border switches to teal inset ring; error state overrides to red ring regardless of focus.
- No page-transition animations; press-fade only.
- Loading states use inline text swap, not spinners.

## State Management
- Login: `email`, `password`, `error`, `loading`.
- Signup: single `form` object (8 fields) + `errors` map (per-field) + `loading`.
- Validation runs on submit; per-field errors clear as the user edits that field.

## Design Tokens
See `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css` for the full source of truth. Key values:

**Colors**
- Brand teal: `#0F8B8D` (dark `#0B6B6D`, light `#E6F5F5`)
- Brand orange: `#F2994A` (dark `#D97F2E`, light `#FEF1E4`)
- Ink: `#1B2523` · Ink secondary: `#55635F` · Muted: `#7C8C8B`
- Surface white: `#FFFFFF` · Surface subtle: `#F4F9F9`
- Border default: `#D8E4E3` · Border subtle: `#E3ECEA`
- Success: `#1E9E6B` · Warning: `#F2994A` · Error: `#E5484D`

**Typography**
- Headings/buttons: Sora (600/700/800)
- Body/inputs: Inter (400/500/600/700)
- Scale: display 34px, heading-xl 28px, heading-lg 22px, body 15px, body-sm 13px, caption 12px

**Spacing / Radius**
- Base unit 4px scale up to 44px section gap
- Input/button radius 10px · card radius 14px · chip radius 12px · banner radius 8px
- Mobile canvas reference: 375×812px

## Assets
- `assets/logo.jpg` — user-supplied "ridr" car mark (teal body, orange roof/window accents). Only image asset in the system; no other illustrations. Not vectorized — flag as a to-do if a scalable format is needed.

## Files
- `styles.css` — entry point importing all tokens
- `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`
- `components/*/*.jsx` + `.d.ts` + `.prompt.md` + `.card.html` — Button, Input, Card, Avatar, Tabs, Modal, Badge, ErrorBanner (React reference implementations; re-implement in the target stack's patterns, don't import these files as-is unless the target is web React)
- `guidelines/*.card.html` — color/type/spacing/brand visual references
- `ui_kits/app/index.html` — interactive HTML prototype of the full Welcome→Login→Signup→Home flow (open in a browser to click through it)
- `readme.md` — design system overview (source narrative, duplicate of context above)
