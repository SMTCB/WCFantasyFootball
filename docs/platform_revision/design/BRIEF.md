# FantasyKit — Redesign Brief
**Status:** Direction committed · June 2026  
**Goal:** Post-pilot visual overhaul, positioned as a white-label SaaS platform

---

## Context

FantasyKit is a fantasy football platform currently in pilot. The pilot runs on a dark "Forza" aesthetic (near-black, all-caps mono, cyan accents) that was built to align with a Forza partnership. That direction is being retired.

**The pivot:** The product is being repositioned as a white-label SaaS — a platform that sports organisations (broadcasters, leagues, clubs, media companies) can license and skin with their own branding. This changes the design job from "make a fantasy app" to "design a platform that any brand can own."

The live pilot URL is: https://wc-fantasy-football.vercel.app  
Demo credentials: demo@fantasykit.test / ForzaDemo2026!

---

## What Was Assessed

Full platform audit is in `Platform Assessment.html`. Summary of the 6 findings:

| # | Issue | Severity |
|---|-------|----------|
| 1 | Surfaces too dark — near-black with invisible hierarchy | Critical |
| 2 | Three navigation layers active simultaneously in League Hub | Critical |
| 3 | Three visual languages coexist (dark app / Forza Times newspaper / Bootstrap admin) | Critical |
| 4 | Typography too small throughout (10–11px metadata everywhere) | Moderate |
| 5 | Forza brand name is a liability for white-label positioning | Moderate |
| 6 | League select has no context (no rank, no status, no activity) | Minor |

**What works and should be kept:**
- Message/chat components
- Scores & Match Centre screens
- Bets & Predictions card pattern
- Horizontal pitch token concept (pill shape, number badge + name)
- Archivo Black + JetBrains Mono type pairing

---

## Two Directions Explored

Both directions are mocked in `Identity Exploration.html` — a design canvas with Foundation, Key Screens, Mobile, and White Label sections.

### Direction 1 — KIT (Light) ✅ CHOSEN
Light-first, warm, editorial. Clean enough for any client to make it their own.

| Token | Value |
|-------|-------|
| Background | `#F7F3ED` |
| Card | `#FFFFFF` |
| Raised surface | `#EDEAE2` |
| Shell/sidebar | `#18202E` |
| Primary text | `#18202E` |
| Secondary text | `#4B5568` |
| Muted / labels | `#8A97A8` |
| Rule / border | `#E2DDD5` |
| **Accent (primary)** | `#1A6FA8` |
| Accent background | `rgba(26,111,168,.08)` |
| Gold | `#B8720E` |
| Positive | `#166534` |
| Danger | `#B91C1C` |
| Border radius | `6px` |
| Capitalisation | Mixed case (not all-caps) |
| Mono for data? | Sparingly only |

**Type system (unchanged):**
- Headlines / names: `Archivo Black`
- Body / UI: `Archivo 400/500/600`
- Data / labels: `JetBrains Mono` (used sparingly — not for everything)

**Character:** Dark sidebar anchors the chrome. Warm white content area. Strong typographic hierarchy. Readable at a glance. Feels like a premium product a broadcaster could put their name on immediately.

---

### Direction 2 — STADIUM (Dark) — not chosen for default

Kept as the **dark mode toggle**. Deep navy (#0C1120), warmer sky blue accent (#4AADDB), real surface variation (4 levels). This is what power users get when they switch. Not the default out of the box.

---

## White Label Principle

The system is designed so a client override requires changing **3 values only:**
- `--brand-accent` (their primary color)
- `--brand-name` (logo/wordmark)
- Their data (league name, team names)

Everything else — typography, spacing, component shapes, layout patterns — stays constant. Demonstrated in the canvas with a "La Liga Fantasy" skin (red accent).

---

## Navigation Redesign (to carry forward)

The current app has 3 competing nav layers inside League. The new structure:

**Desktop:**
- Left sidebar: product-level nav (Scores, League, Squad, Live, Market)
- Inside League: 5 tabs max (Leaderboard, Feed, Bets, Squad, Market)
- No sticky "MANAGE SQUAD / MARKET" bar — those become sidebar actions

**Mobile:**
- Bottom tab bar replaces sidebar (Scores, League, Squad, Live, Market)
- Inside League: horizontal tab strip (same 5 tabs)
- No competing nav layers

---

## Screens Mocked So Far

| Screen | Direction | Notes |
|--------|-----------|-------|
| Foundation / identity card | Both | Colors, type, components |
| League Hub — Leaderboard | Kit (Light) | With right panel: deadline, activity, squad card |
| My Squad — Pitch view | Stadium (Dark) | Refined tokens, navy pitch |
| Mobile — League Hub | Both | Bottom tab nav pattern |
| White label — La Liga Fantasy | Kit | Red accent, Spanish data |

---

## What to Explore Next (in fresh session)

Priority screens for the Kit direction:

1. **My Squad — pitch view in Kit (light)** — how does the pitch look on a light ground? Needs careful treatment.
2. **Player Market** — the current market is a dark list with circle avatars. Needs a full redesign in Kit.
3. **Bets & Predictions** — already works well, needs Kit styling applied.
4. **Player modal / detail drawer** — tapping a player opens a panel. Not designed yet in the new system.
5. **League Select / Home** — the first screen after login. Needs rank, status, activity per league card.
6. **Mobile — My Squad** — the pitch view on mobile is a key moment.
7. **Empty states** — what does an empty squad / empty league look like in Kit?
8. **Onboarding** — not explored at all. First-run experience.

---

## Files in This Folder

| File | Description |
|------|-------------|
| `BRIEF.md` | This document |
| `Platform Assessment.html` | Full audit with annotated screenshots and 3 directions |
| `Identity Exploration.html` | Design canvas: Foundation + Key Screens + Mobile + White Label |

---

## Notes for Next Session

- Load `Identity Exploration.html` first to see the visual reference for the Kit direction
- The tokens table above is the source of truth for the Kit palette — use it
- The design canvas has a pan/zoom interface — scroll and zoom to explore artboards
- Refer to the Platform Assessment for context on what's broken in the current app
- The white-label angle should inform every decision: if a screen feels "branded" rather than "platform", reconsider it
