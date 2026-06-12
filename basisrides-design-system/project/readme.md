# BasisRides Design System

**BasisRides** is a carpooling mobile app built for parents of students at **BASIS Independent Silicon Valley (BISV)**. It lets families coordinate ride-sharing so kids can get to and from school safely, with minimal friction. The app is built in React Native (Expo) with a Supabase backend.

---

## Sources

| Resource | Path / URL |
|---|---|
| Figma file | `Login Page (Community) (2).fig` — mounted as virtual FS during build |
| GitHub repo | https://github.com/realvidhaan/basisrides |
| Codebase | `BasisRide/` — React Native / Expo / NativeWind / TypeScript |

> To explore the GitHub repo further, visit the link above — it contains the full source for the screens, components, and Supabase integration referenced here.

---

## Products

| Surface | Description |
|---|---|
| **Mobile App** | React Native (iOS-first), authentication flow + home screen with ride scheduling (in progress) |

The app currently ships: Welcome screen → Login → Signup (with child info, grade, neighborhood, car capacity) → Home screen with logout. Ride scheduling is marked "coming Day 2" in the codebase.

---

## CONTENT FUNDAMENTALS

### Voice & Tone
- **Warm, practical, community-first.** BasisRides is built by a parent/student for a school community — the copy is friendly and direct, never corporate.
- **First-person neutral.** Uses "you" to address the parent/user. No "I" from the app itself.
- **Sentence case** throughout — not Title Case or ALL CAPS (except the logo wordmark "BASIS RIDES").
- **No emoji** in UI copy. The codebase uses ⚠️ only inside an error component utility; it is not part of headline or body copy.
- **Concise form labels** — "Full name", "Child's name", "Neighborhood", "Car capacity". No verbose instructions unless needed for clarity (e.g. "Enter 0 if you don't drive").
- **Warm error messages** — humanized, not technical. "Account setup failed. Please try again." not "Error 500."
- **Link copy is descriptive** — "Sign up", "Log in", "New to BasisRide? Sign up", not generic "click here."

### Example copy
> "Carpool for BISV families"  
> "Welcome back to BasisRides. Glad to see you again!"  
> "Don't worry! It occurs. Please enter the email address linked with your account."  
> "Enter 0 if you don't drive"  
> "New to BasisRide? Sign up"

---

## VISUAL FOUNDATIONS

### Colors
- **Primary red** `#DC143C` (crimson) — the dominant brand accent. Used on CTAs, wordmark, links, active borders.
- **Ink** `#1E232C` — near-black for headings and body text. Not pure black.
- **White** `#FFFFFF` — page backgrounds, card surfaces.
- **Input fill** `#F7F8F9` — barely-there off-white for unfocused input backgrounds.
- **Muted** `#8391A1` — placeholder text, secondary captions.
- **Border** `#DADADA` — default input/card borders.
- **Subtle border** `#E8ECF4` — back-button rings, dividers.
- **Success** `#16A34A` — positive states.
- **Warning** `#FF9500` — amber/orange alert.
- **Positive** `#18C07A` — green accent.

### Typography
- **Urbanist** (Google Fonts) — primary typeface for all headings, labels, buttons, and body. Used at Medium (500), SemiBold (600), and Bold (700). Clean geometric sans with a friendly feel.
- **Poppins** (Google Fonts) — used for bottom link copy ("Don't have an account? Register Now", "Remember Password? Login"). Slightly more rounded and warm.
- **No serif fonts**; no monospace in the UI.
- Heading size: **30px / Bold / letter-spacing -0.01em / line-height 1.3**
- Body: **15–16px / Medium**
- Button labels: **15px / Bold (Urbanist) or SemiBold**
- Input placeholder: **15px / Medium / #8391A1**
- Labels: **13px / Medium / #0A0A0A**
- Captions: **12px / Regular / #6B6B6B**

### Spacing & Layout
- Mobile canvas: **375 × 812px** (iPhone 13 standard)
- Horizontal screen padding: **20–24px**
- Vertical gap between form fields: **16px**
- Section gap: **40–48px**
- Back button chip: **41×41px** with 12px radius

### Backgrounds
- **Flat white** — all screens are solid `#FFFFFF`. No gradients, no textures, no imagery behind content.
- The logo image sits on its own layer on the Welcome screen. No full-bleed hero images on other screens.

### Cards & Containers
- Input fields: `#F7F8F9` fill + `1.5px #DADADA` inset border + `10px` border-radius. Focus state switches border to `#DC143C`.
- Buttons (primary): `#DC143C` fill, `8–10px` radius, white Bold text, no border.
- Buttons (outline): white fill, `1px #1E232C` inset border, dark text.
- Back button: white fill + `1px #E8ECF4` inset ring, `12px` radius chip.
- No card shadows on auth screens — the UI is flat and open.

### Borders & Dividers
- All borders are **inset box-shadows** in Figma (no actual `border` property) — `inset 0 0 0 1px`.
- Hairline dividers at `#E0E0E0` (codebase signup header).
- No decorative rules or ornamental lines.

### Corner Radii
- Input / button: **8px** (Figma) / **10px** (codebase implementation) — use 10px as the canonical value.
- Back chip: **12px**.
- Error banner: **8px**.

### Shadows
- No `box-shadow` for elevation/depth. Shadows are only used for **inset borders** (inputs, chips).
- No drop shadows on any element.

### Animation & Motion
- `activeOpacity: 0.85` on TouchableOpacity — simple press-fade, not a scale transform.
- No entrance animations, no page transitions defined. Navigation is instant.
- No loading skeletons; loading is indicated with `ActivityIndicator` (spinner) inside the button.

### Hover / Press States
- Buttons: fade to 60% opacity when disabled, 0.85 opacity on press.
- No color shift on hover (native mobile, no hover).
- Focus: input border swaps to `#DC143C`.

### Iconography
- Minimal icon usage. The Figma design uses inline SVG vectors (back arrow chevron, wifi/signal/battery status-bar icons, eye icon for password reveal).
- No icon library is bundled. Icons are rendered as inline SVGs or React Native vector paths.
- See ICONOGRAPHY section below.

### Imagery
- Only one image in the design system: the **BASIS RIDES logo** (`assets/logo.png`), a horizontal lockup with two chevrons (red + black) and "BASIS RIDES" wordmark.
- No illustrations, no photography, no patterned backgrounds.

---

## ICONOGRAPHY

### Approach
BasisRides uses **minimal, functional iconography**. There is no icon library or font bundled in the app. Icons appear in two contexts:

1. **Status bar icons** (Wifi, Mobile Signal, Battery) — these are Figma/system UI artifacts, not app-authored icons.
2. **Functional icons**:
   - **Back arrow chevron** — inline SVG path `Vector.svg`, used on Login/Register/Forgot-Password screens inside a 41×41px chip.
   - **Eye icon** — `fluent:eye-20-filled` style, inline SVG, used for show/hide password toggle. 16×16 effective size, `#6A707C` color.

### Key assets (`assets/`)
| File | Usage |
|---|---|
| `logo.png` | Full BASIS RIDES horizontal lockup (red+black chevrons + wordmark) |

### Icon style
- **Outline / minimal line** style for functional icons.
- **No emoji** used as UI icons.
- **No unicode chars** used as icons (except the `‹` chevron in codebase signup back button — legacy).
- Color: `#1E232C` (ink) for navigation icons; `#6A707C` for secondary/utility icons.

---

## File Index

```
styles.css                    ← global entry point (import this)
tokens/
  colors.css                  ← color custom properties
  typography.css              ← font imports + type scale tokens
  spacing.css                 ← spacing, radius, shadow, transition tokens
assets/
  logo.png                    ← BASIS RIDES horizontal logo lockup
components/
  core/                       ← Button, Input, ErrorMessage
  feedback/                   ← Badge, ErrorBanner
guidelines/
  colors.card.html            ← color swatch cards
  typography.card.html        ← type scale specimen
  spacing.card.html           ← spacing scale specimen
  brand.card.html             ← logo + brand overview
ui_kits/
  app/
    index.html                ← interactive auth flow prototype
    LoginScreen.jsx
    SignupScreen.jsx
    WelcomeScreen.jsx
    HomeScreen.jsx
readme.md                     ← this file
SKILL.md                      ← agent skill definition
```

---

## Components

| Component | Path | Description |
|---|---|---|
| `Button` | `components/core/` | Primary, outline, disabled states |
| `Input` | `components/core/` | Text input with label, error, focus states |
| `ErrorBanner` | `components/core/` | Inline error message with icon |
| `Badge` | `components/feedback/` | Status badges (success, warning, error, neutral) |

---

## UI Kits

| Kit | Path | Screens |
|---|---|---|
| Mobile App | `ui_kits/app/index.html` | Welcome, Login, Signup, Home |
