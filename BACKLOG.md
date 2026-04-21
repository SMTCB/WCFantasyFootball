# ForzaKit — Product Backlog
## World Cup 2026 Fantasy Football Platform

**Stack:** React 19 + Supabase | **Target Launch:** June 2026
**Last updated:** 2026-04-21 | **Completed:** FB-001, FB-002 (auth on-hold), FB-003, FB-006, FB-007, FB-008, FB-016

> Items are ordered strictly by criticality and urgency within each priority tier.
> P0 items are sequenced by dependency chain — the first item must be done before the next.
> Complexity scale: XS (< 0.5 day) · S (0.5–1 day) · M (2–3 days) · L (4–7 days) · XL (> 1 week)

---

## Priority Legend

| Label | Meaning |
|-------|---------|
| **P0** | Pre-launch blocker — must ship before go-live |
| **P1** | High impact — ships within first 2 weeks of tournament |
| **P2** | Post-launch — ships during group stage or after |
| **P3** | Future — post-tournament or v2 roadmap |

---

## Launch Readiness Summary

| Priority | Count | Target |
|----------|-------|--------|
| **P0 — Pre-launch blockers** | 18 items | May 31, 2026 |
| **P1 — High impact** | 25 items | June 14, 2026 |
| **P2 — Post-launch** | 16 items | June 28, 2026 |
| **P3 — Future** | 1 item | Post-tournament |
| **Total** | **60 items** | |

---

## Critical Path (read before starting any development)

```
FB-001  Fix Supabase env config
  └── FB-002  Wire real authentication (useAuth hook)
        └── FB-003  RLS policies — all tables secured
              └── FB-004  Email verification + password reset
                    └── FB-005  Username + public profile
                          └── FB-006  Unify player data model
                                └── FB-007  Server-tracked squad budget
                                      └── FB-008  Transfer window lock UI
                                            └── FB-009  Server-side deadline enforcement
                                                  └── FB-010  Transfer countdown UX

FB-011  Supabase Realtime subscriptions
  └── FB-012  Live scoring screen (real data)
        └── FB-013  Live event streaming (match_events)
              └── FB-014  Live projections (real squad + averages)
                    └── FB-015  H2H live rival score

FB-016  Error boundary + crash reporting
FB-017  CI/CD pipeline + Vercel previews
FB-018  Onboarding walkthrough
FB-019  Push notification infrastructure
  └── (unlocks FB-036, FB-040, FB-042, FB-051)
```

---

# P0 — Pre-Launch Blockers
*Must be complete before any real user touches the app. Ordered by dependency — do not skip ahead.*

---

### FB-001
**Title:** Fix Supabase client — load credentials from environment variables

**Priority:** P0 · **Complexity:** XS

**User Story:** As a developer, I want Supabase credentials loaded from environment variables so that no secrets are hardcoded in source code and the app can connect to the real database.

**Acceptance Criteria:**
- `lib/supabase.js` reads `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`
- `.env.local` created locally (gitignored); `.env.example` committed with placeholder values
- Vercel project has both env vars set for production and preview environments
- App logs a clear error and refuses to boot if env vars are missing
- No credentials visible in the built JS bundle (`grep` on dist output)

**Dependencies:** None — do this first

**Source:** Code audit — `lib/supabase.js` has `'placeholder_key'` hardcoded; all DB calls fail silently

**Notes:** Takes under an hour. Must be done before any other item — without a working DB connection nothing else can be tested. The anon key is safe to expose in client-side code (it's read-only by design); the service role key must never leave the server.

---

### FB-002 ✅ COMPLETED — 2026-04-21 (auth inactive — gated behind VITE_AUTH_ENABLED)
**Title:** Wire real authentication — remove hardcoded user ID from all screens

**Priority:** P0 · **Complexity:** M

**User Story:** As a user, I want the app to recognise me specifically so that my squad, points, and league data are mine and mine alone.

**Acceptance Criteria:**
- Hardcoded `userId = '00000000-0000-0000-0000-000000000000'` removed from all 9 screens
- A `useAuth()` custom hook returns the real session user ID from `supabase.auth.getUser()`
- Auth guard in `App.jsx` re-enabled; unauthenticated users redirected to the Auth screen
- Session restored on page reload via `supabase.auth.onAuthStateChange` listener
- All screens tested with two separate real accounts to confirm data isolation

**Dependencies:** FB-001

**Source:** Code audit — every screen has the same hardcoded UUID; multi-user is impossible

**Notes:** This is the most critical gap in the codebase. Write the `useAuth()` hook first, then do a single coordinated find-and-replace pass across all screens. Touching every screen at once is a merge risk — do it in one PR.

---

### FB-003 ✅ COMPLETED — 2026-04-21
**Title:** Row-level security (RLS) — enable and harden all Supabase tables

**Priority:** P0 · **Complexity:** M

**User Story:** As a user, I want my squad and transfer data to be private so that rival managers cannot query my team before the deadline.

**Acceptance Criteria:**
- RLS enabled on every table; policies documented in a `supabase/policies.md` file
- `squads` and `transfers` rows readable only by the owning user and league commissioners, until deadline passes
- `players`, `fixtures`, `player_stats` publicly readable (no auth required)
- `is_admin` boolean on `profiles` used for admin-only write access
- Penetration test checklist signed off pre-launch

**Dependencies:** FB-002

**Source:** Code audit + security requirement — all tables currently have RLS disabled (Alpha mode)

**Notes:** Run `supabase inspect db` and review policy output. This cannot be deferred — shipping with RLS off means any user can read any other user's squad. One `supabase db reset` wipes all data; run migrations in order.

---

### FB-004
**Title:** Email verification and password reset flow

**Priority:** P0 · **Complexity:** S

**User Story:** As a new user, I want to verify my email and reset my password if forgotten so that my account is secure and recoverable.

**Acceptance Criteria:**
- Supabase email verification sent on signup; unverified users see a banner but can still browse
- Unverified users cannot join or create leagues until email is confirmed
- Password reset email triggered from "Forgot password" link on Auth screen
- Email templates use ForzaKit branding (logo, colours, footer links)
- Custom SMTP sender configured (Resend) for reliable inbox delivery

**Dependencies:** FB-002

**Source:** Standard auth requirement

**Notes:** Customise email templates in Supabase Dashboard → Auth → Email Templates. Supabase's default sender (`noreply@mail.supabase.io`) has poor deliverability — switch to a custom domain via Resend before beta.

---

### FB-005
**Title:** Username selection and public profile setup

**Priority:** P0 · **Complexity:** S

**User Story:** As a new user, I want to choose a unique username so that league mates can identify me in standings, chat, and the Gazette.

**Acceptance Criteria:**
- Username prompted as first step after signup (before reaching the app)
- Usernames 3–20 characters, alphanumeric + underscores only, unique DB constraint enforced
- Availability checked in real-time with 300ms debounce
- Username displayed throughout: standings, chat, Gazette cards, invite cards
- Users can change username once per month (`profiles.username_changed_at`)

**Dependencies:** FB-004

**Source:** Code audit — RecapScreen hardcodes `username = 'João'`; LeagueScreen fallback inserts "You" as username

**Notes:** Pre-generate 3–5 username suggestions from the email prefix to reduce drop-off. Confirm a unique index exists on `profiles.username` in the migration.

---

### FB-006 ✅ COMPLETED — 2026-04-21
**Title:** Unify player data model across all screens

**Priority:** P0 · **Complexity:** S

**User Story:** As a developer, I want a single consistent player data shape across all screens so that field mismatches don't cause silent bugs when player data moves between components.

**Acceptance Criteria:**
- Canonical player shape defined (JSDoc typedef or TypeScript interface): `{ id, name, position, club, price, points, gridClass, intel, ownership_pct }`
- A `normalisePlayer(raw)` utility in `src/lib/players.js` maps any DB response to this shape
- All 6 screens that use player data import from `normalisePlayer` — no ad-hoc field remapping inline
- Fallback data in `src/data/squad.js` conforms to the canonical shape
- No screen has a local `{ id: p.player_id, name: p.player_name }` remap pattern

**Dependencies:** FB-002

**Source:** Code audit — 4 different player shapes exist across screens; `gridClass` and `intel` only in squad.js, `price` missing in LiveScreen, `ownership_pct` missing everywhere

**Notes:** Write the utility first, then update screens one by one. No schema changes needed — this is a pure frontend refactor. Zero risk of regressions if each screen is tested after update.

---

### FB-007 ✅ COMPLETED — 2026-04-21
**Title:** Squad budget — server-tracked, not client-computed from fallback data

**Priority:** P0 · **Complexity:** S

**User Story:** As a player, I want my remaining transfer budget to be accurate and server-enforced so that I cannot accidentally overspend.

**Acceptance Criteria:**
- `squads.budget_remaining` column is the authoritative value; never computed client-side from player lists
- Budget decrements on buy and increments on sell via the server-side transfer handler
- If budget would go negative, the transfer is rejected server-side with a clear error toast
- Budget displayed consistently across Squad screen, Market screen, and Admin screen
- Budget initialised at £100M on squad creation

**Dependencies:** FB-006

**Source:** Code audit — MarketScreen sums prices from the fallback player array and subtracts from 100; budget always shows £100M even after purchases

**Notes:** Add `budget_remaining NUMERIC DEFAULT 100` to the `squads` table migration. Update on every transfer upsert in the edge function. Client displays the value read from DB — no local calculation.

---

### FB-008 ✅ COMPLETED — 2026-04-21
**Title:** Transfer window lock state — disable buy/sell UI when squad is locked

**Priority:** P0 · **Complexity:** S

**User Story:** As a player after the transfer deadline, I want the market to be visually locked so that I understand no changes are possible.

**Acceptance Criteria:**
- After matchday deadline, all buy/sell buttons in MarketScreen show "Squad Locked" and are non-interactive
- Lock state derived from server time vs `matchday_deadlines` table — not the client clock
- Squad screen shows a lock banner with time until unlock
- Users who attempt a transfer during lock see: "Transfers are locked until after the match"
- Lock lifts automatically when admin publishes results for that matchday

**Dependencies:** FB-007, `matchday_deadlines` table

**Source:** Code audit — MarketScreen `handleBuy` has no lock check; users can attempt purchases after deadline

**Notes:** Implement client lock state first (fast, visible feedback), then server enforcement (FB-009). Fetch server time from Supabase `select now()` on screen mount — do not trust `Date.now()` alone.

---

### FB-009
**Title:** Transfer deadline lock enforcement — server-side edge function

**Priority:** P0 · **Complexity:** M

**User Story:** As a league commissioner, I want the server to hard-reject transfers after the deadline so that no team can gain an unfair advantage from late edits.

**Acceptance Criteria:**
- Supabase edge function validates transfer timestamp against `matchday_deadlines` before writing to DB
- Any in-flight transfer submitted after deadline returns 403 with a user-friendly error message
- Admin panel can override deadline per matchday
- Unit tests cover the lock boundary: 1 second before (allowed) and 1 second after (rejected)
- Server log records all rejected transfer attempts for audit

**Dependencies:** FB-008

**Source:** FPL model; fairness requirement — client-side lock is trivially bypassable

**Notes:** Edge function is the single source of truth. Store all deadlines in UTC; convert to local time only in the UI layer.

---

### FB-010
**Title:** Transfer deadline countdown with pressure UX

**Priority:** P0 · **Complexity:** S

**User Story:** As a player, I want a visible countdown to the transfer deadline so that I don't miss the lock without knowing.

**Acceptance Criteria:**
- Countdown timer on Squad screen header and Home screen matchday card when < 24 hours remain
- Timer turns amber at T-2h, red at T-30min, shows lock icon after deadline
- Dynamic deadline time replaces the hardcoded `'18:00 today'` label in HomeScreen (current code audit gap)
- Deadline shown in user's local timezone (use `Intl.DateTimeFormat`)
- Timer derived from server time delta (fetched on mount), not `Date.now()` alone

**Dependencies:** FB-009, `matchday_deadlines` table

**Source:** Code audit — `LOCK_TIME_LABEL = '18:00 today'` is a hardcoded constant in HomeScreen line 7; FPL deadline UX pattern

**Notes:** The T-30min push notification is the highest-converting engagement send — wire it here even if FB-019 (full push infra) is not yet complete, using a simpler one-shot Supabase edge function cron.

---

### FB-011
**Title:** Supabase Realtime subscriptions for live scoring

**Priority:** P0 · **Complexity:** M

**User Story:** As a player, I want the app to automatically update my score during a match without refreshing so that I can follow the action live.

**Acceptance Criteria:**
- Supabase Realtime channel subscribes to `fantasy_points` table on Live screen mount
- Score deltas render within 60 seconds of a goal event written to the DB
- Subscription cleanly unsubscribes on screen unmount (no memory leaks)
- Offline/reconnect state handled with a "Reconnecting…" banner
- Works on desktop Chrome and mobile Safari

**Dependencies:** FB-003 (RLS must be set correctly for Realtime to work per-user)

**Source:** LaLiga Fantasy sub-60s live update model

**Notes:** Enable Supabase Realtime on the `fantasy_points` table. Add a polling fallback (every 90s) for networks that block WebSockets. Test connection limits — Supabase Pro allows 500 concurrent connections; load test before launch.

---

### FB-012
**Title:** Live scoring screen — wire real data and per-player stat breakdown

**Priority:** P0 · **Complexity:** M

**User Story:** As a player watching a match, I want to see each of my players' live point contributions so that I know exactly why my score is moving.

**Acceptance Criteria:**
- Live screen shows each player's current points with breakdown (goals, assists, clean sheet, bonus)
- Points update within 60s of a scoring event via FB-011 Realtime subscription
- Captain points displayed at 2× (or active chip multiplier)
- "Last updated X seconds ago" timestamp shown
- Real squad data used — not the `POSITION_AVG` constants currently in the code (`GK=6, DEF=5, MID=7, FWD=8`)

**Dependencies:** FB-011, FB-006 (unified player model), live data provider

**Source:** Code audit — LiveScreen uses hardcoded position averages for all projection calculations; real squad data fetched but `seasonAvg` field is missing

**Notes:** The projection engine logic is structurally sound — it just needs real inputs. Fix: join squad player fetch with `player_stats` to get per-player averages. No architecture change needed.

---

### FB-013
**Title:** Live screen — wire Supabase Realtime for match event streaming

**Priority:** P0 · **Complexity:** M

**User Story:** As a player on the Live screen, I want match events (goals, cards, substitutions) to stream in real time so I can follow the action as it happens.

**Acceptance Criteria:**
- `match_events` table subscribed via Supabase Realtime channel on Live screen mount
- New events appear in activity feed within 60 seconds
- Events filterable: "My Players Only" vs "All Matches"
- Feed auto-scrolls to newest event with a "Pause" button
- Subscription tears down cleanly on unmount

**Dependencies:** FB-011, live data provider writing to `match_events`

**Source:** Code audit — LiveScreen polls `match_events` once on mount with a 5-minute interval; no Realtime subscription; displayed events are usually mock data

**Notes:** Replace the existing `setInterval` with a `supabase.channel(...).on('postgres_changes', ...)` subscription filtered to current matchday fixture IDs. Requires the data provider to be writing to `match_events` — this is the key external dependency.

---

### FB-014
**Title:** Live screen projections — use real squad and per-player averages

**Priority:** P0 · **Complexity:** M

**User Story:** As a player on the Live screen, I want my score projection to reflect my actual squad and real player form, not a generic position-based estimate.

**Acceptance Criteria:**
- Projection uses authenticated user's actual squad (not `POSITION_AVG` constants)
- Per-player `season_avg_points` sourced from `player_stats` table
- Rival projections use their actual squads (post-deadline, read-only)
- Projection refreshes every 60 seconds during live windows (not every 5 minutes)
- "Based on X players in active matches" confidence label shown

**Dependencies:** FB-012, FB-013

**Source:** Code audit — LiveScreen `recalcProjection` feeds generic position constants; `mySquadPlayers` fetched without stats join

**Notes:** Join the squad player fetch with `player_stats` to pull `season_avg_points`. Pass per-player values to the existing projection formula — no structural change to the calculation logic needed.

---

### FB-015
**Title:** H2H live rival score — real-time opponent view in Live screen

**Priority:** P0 · **Complexity:** M

**User Story:** As a player in an H2H matchup, I want to see my opponent's live score updating alongside mine so that I feel the head-to-head tension in real time.

**Acceptance Criteria:**
- H2H live view shows two columns: My Score vs Opponent Score
- Both update on the same Realtime subscription (FB-011)
- Opponent's goalscorers listed by name with points contributed (squad composition not revealed before deadline)
- Win/Draw/Loss indicator updates live
- Tapping an opponent's player name shows their public stats card only

**Dependencies:** FB-014, H2H league system (FB-033)

**Source:** Code audit — LiveScreen rival scores are hardcoded/faked; Sleeper rival view model

**Notes:** This is the engagement flywheel — managers check 5× more often when an H2H rival is visible. Use React 19 transitions to avoid full re-renders on each score tick.

---

### FB-016 ✅ COMPLETED — 2026-04-21
**Title:** Error boundary and crash reporting

**Priority:** P0 · **Complexity:** S

**User Story:** As the development team, I want unhandled React errors caught and reported so that we can fix production crashes before users notice.

**Acceptance Criteria:**
- React `ErrorBoundary` wraps all top-level screen components
- Fallback UI shown on crash with a "Reload" CTA — no white screen of death
- Errors sent to Sentry with: user ID (UUID), screen name, stack trace
- Alert fires to team Slack if error rate exceeds 1% of sessions in 5 minutes
- Source maps uploaded to Sentry in the CI/CD build step

**Dependencies:** None (can be done in parallel with any other item)

**Source:** Internal quality requirement

**Notes:** Use React 19's `useErrorBoundary` hook. Sentry free tier is sufficient at launch volume. Scrub PII — user UUID is fine to send; email address is not.

---

### FB-017
**Title:** CI/CD pipeline with Vercel preview deployments and automated tests

**Priority:** P0 · **Complexity:** M

**User Story:** As a developer, I want every PR to deploy a preview environment so that features can be reviewed before merging to main.

**Acceptance Criteria:**
- GitHub Actions runs lint, unit tests, and Playwright smoke tests on every PR
- Vercel preview URL posted automatically as a PR comment
- Main branch auto-deploys to production on merge
- Supabase migrations run automatically against a staging DB branch on PR open
- Build fails hard if any test fails — no manual override

**Dependencies:** FB-001

**Source:** Internal DevOps requirement

**Notes:** Use Supabase branching (Pro tier) for per-PR DB environments. Scope `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` separately for preview vs production in Vercel settings.

---

### FB-018
**Title:** Onboarding flow — new user welcome and squad builder walkthrough

**Priority:** P0 · **Complexity:** M

**User Story:** As a new user, I want a guided walkthrough when I first arrive so that I can build my squad and join a league without reading documentation.

**Acceptance Criteria:**
- 4-step onboarding: (1) Welcome + WC 2026 context, (2) Pick your squad with suggestions, (3) Join or create a league, (4) Set notification preferences
- Progress indicator shown (step X of 4); skippable at any step with flag persisted so it never repeats
- Walkthrough tooltips overlay Squad and Market screens on first visit
- Onboarding completion tracked in analytics (drop-off by step)
- Target: > 70% completion rate from install to first squad saved

**Dependencies:** FB-005, FB-006

**Source:** Sleeper onboarding model; DraftKings first-session UX

**Notes:** First-session completion rate is the single most predictive metric for 30-day retention. Use `react-joyride` rather than a custom tooltip system. A/B test skippable vs forced on step 2 (squad pick).

---

# P1 — High Impact
*Ship within the first two weeks of the tournament. Ordered by impact on user retention.*

---

### FB-019
**Title:** Recap screen — replace all hardcoded data with real DB values

**Priority:** P1 · **Complexity:** S

**User Story:** As a player viewing my Recap card, I want to see my actual username, real league name, and genuine point totals so that the card is worth sharing.

**Acceptance Criteria:**
- League name from `leagues` table via user's membership — not hardcoded "World Cup Legends"
- Username from `profiles.username` — not hardcoded "João"
- Best player, captain, and joker points from `fantasy_points` table — not literals 15, 10, 5
- If no recap exists for the current matchday: "Results pending…" state shown
- All data paths tested end-to-end with a real matchday result in the DB

**Dependencies:** FB-005, FB-002

**Source:** Code audit — RecapScreen has `leagueName = 'World Cup Legends'`, `username = 'João'`, and hardcoded point values; the Gazette card will never be shared if it shows the wrong person's name

**Notes:** The Gazette card is the app's primary viral sharing mechanic. This is a must-fix before launch — a shared card with the wrong name destroys trust instantly.

---

### FB-020
**Title:** Persist top-scorer prediction to database

**Priority:** P1 · **Complexity:** S

**User Story:** As a player, I want my match predictions to be saved so that I earn prediction points and my streak is tracked after results come in.

**Acceptance Criteria:**
- PredictionModal `onSave` upserts a row in `top_scorer_predictions` table
- Prediction locked at match kick-off via server-side check (not just UI disabled)
- Saved prediction shown on Home screen without a page reload
- Duplicate prevention: update, not insert, if prediction exists for this matchday
- Prediction points credited to `league_members.prediction_points` after results

**Dependencies:** FB-002

**Source:** Code audit — `handlePredictionSaved` in HomeScreen updates only local React state; nothing is written to Supabase

**Notes:** The modal UI and state flow already work. This is a single missing `supabase.from('top_scorer_predictions').upsert(...)` call. Do this immediately after FB-002 — it's a 30-minute task once auth is wired.

---

### FB-021
**Title:** Sell player validation — captain and joker safety checks

**Priority:** P1 · **Complexity:** S

**User Story:** As a player selling a player, I want the app to warn me if I'm removing my captain or active joker so that I don't accidentally break my squad.

**Acceptance Criteria:**
- Selling the current captain triggers: "This player is your captain. Selling them removes your captain — continue?"
- Selling the active Daily Joker triggers a similar confirmation
- On confirm, captain/joker cleared in DB before the transfer completes (atomic)
- Cancel returns to market with no changes
- Orphaned `captain_id` references validated: scoring engine checks captain is still in squad before applying multiplier

**Dependencies:** FB-007, FB-002

**Source:** Code audit — `handleSell` in MarketScreen has no captain/joker check; an orphaned `captain_id` breaks the scoring engine

**Notes:** This is a data correctness bug, not just UX. Fix both the UI guard and add a defensive check in the scoring engine.

---

### FB-022
**Title:** Squad swap — enforce formation and position limits

**Priority:** P1 · **Complexity:** S

**User Story:** As a player making a substitution, I want the app to prevent invalid formations so I can't field a squad with no goalkeeper.

**Acceptance Criteria:**
- Before confirming a swap, validate result: min 1 GK, 3 DEF, 2 MID, 1 FWD on pitch
- Invalid swap shows: "This swap would leave you with no goalkeeper on the pitch"
- Validation runs client-side (immediate feedback) and server-side (integrity)
- Bench has no formation restriction; any position can sit there
- Current code bug fixed: `alert('Invalid swap')` fires but does not `return` early — swap proceeds anyway

**Dependencies:** FB-007

**Source:** Code audit — SquadScreen `handleSwap` has no formation validation; the guard alert exists but is non-blocking

**Notes:** Two-line fix for the `return` bug. Formation validation logic is the real work. Add to the server-side transfer edge function as well.

---

### FB-023
**Title:** Confirmation dialogs for all destructive squad actions

**Priority:** P1 · **Complexity:** XS

**User Story:** As a player, I want to confirm before I sell a player, activate a chip, or spin Captain Roulette so that I don't make irreversible changes by accident.

**Acceptance Criteria:**
- Sell player: "Sell [Name] for £Xm?" → Confirm / Cancel
- Chip activation: "Use [Chip]? This cannot be undone for this matchday." → Confirm / Cancel
- Captain Roulette: "Spin Roulette? Your captain will be randomly assigned." → Confirm / Cancel
- Consequence shown in plain language — not just "Are you sure?"
- Single reusable `ConfirmModal` component used across all three flows

**Dependencies:** FB-007

**Source:** Code audit — chips can be toggled without confirmation; Roulette spins immediately; sell has no dialog

**Notes:** Build one `ConfirmModal` component and wire it to all three flows. Half-day task, maximum. Prevents the most common user complaints and reduces support burden.

---

### FB-024
**Title:** Joker picker modal — empty and error states

**Priority:** P1 · **Complexity:** XS

**User Story:** As a player trying to pick a Daily Joker, I want to see a helpful message if no matches are scheduled or the data fails to load, rather than a blank screen.

**Acceptance Criteria:**
- No fixtures today → "No matches today — check back on the next matchday"
- DB fetch fails → error message + retry button
- No squad players in today's matches → "None of your players are in today's matches"
- Loading state (skeleton or spinner) shown while fetch is in progress
- Each state shown in priority order: no fixtures > DB error > no squad overlap > player list

**Dependencies:** FB-002

**Source:** Code audit — joker picker modal renders blank when `playingTodayTeams` is empty or the DB fetch fails

**Notes:** Purely conditional renders — 30 minutes of work. All three empty states already have clear copy defined above.

---

### FB-025
**Title:** League creation — post-creation invite flow and error handling

**Priority:** P1 · **Complexity:** S

**User Story:** As a user who just created a league, I want to immediately see how to invite friends so my league doesn't sit empty.

**Acceptance Criteria:**
- After successful creation: success screen shows the league join code and "Share Invite" button
- Join code is a human-readable 6-character alphanumeric string (not a UUID)
- "Copy join code" button copies to clipboard with "Copied!" confirmation
- If creation fails, user sees a specific error — not a silent failure
- Creator auto-added as `league_members` with `role: 'commissioner'`; both inserts wrapped in a transaction

**Dependencies:** FB-002, FB-026 (invite cards)

**Source:** Code audit — `handleCreateLeague` in LeagueScreen has no error feedback and no invite prompt; the two-step insert (league → league_member) can partially fail silently

**Notes:** Wrap both inserts in a Supabase edge function so they're atomic. A failed league_member insert currently leaves a league with no commissioner.

---

### FB-026
**Title:** League invite cards (WhatsApp / Instagram shareable)

**Priority:** P1 · **Complexity:** S

**User Story:** As a league member, I want to generate a shareable image card with my league's join code so I can recruit friends with a single tap.

**Acceptance Criteria:**
- One-tap generate from League screen (commissioner and all members)
- Card includes: league name, join code, QR code, ForzaKit branding, WC 2026 visual
- Shared via native share sheet or copied as PNG + text
- Deep link `/join?code=XXXX` pre-fills join code on Auth screen
- Cards invalidated when league is full or registration closed

**Dependencies:** FB-025, auth deep-link handling

**Source:** Sleeper, FPL share-link pattern

**Notes:** Use `@vercel/og` or a pre-rendered template for consistent server-side rendering. `qrcode.react` for QR codes. Deep links must work from cold-start (app not yet installed) — land on web auth → join flow.

---

### FB-027
**Title:** Social sharing — WhatsApp invite loop at key moments

**Priority:** P1 · **Complexity:** S

**User Story:** As an existing manager, I want the app to prompt me to invite friends at the right moment so my league fills up and stays active.

**Acceptance Criteria:**
- Invite prompt triggers after: first squad saved, first matchday results received, a captain return of 15+ pts
- Pre-filled WhatsApp message: "I scored X pts this week on ForzaKit — join my league: [link]"
- Prompt dismissable; doesn't reappear for 48 hours after dismissal
- Link clicks and resulting registrations tracked via UTM parameters
- Manager earns a cosmetic "Recruiter" badge on successful recruitment of 3+ members

**Dependencies:** FB-026

**Source:** Wordle viral loop; Sleeper friend invites

**Notes:** Use `https://wa.me/?text=` URL scheme. Attach `?utm_source=invite&utm_medium=whatsapp&utm_campaign=matchday_result` to all links. This is the primary acquisition channel — instrument it from day one.

---

### FB-028
**Title:** Post-match automated Gazette story card — wire to real data

**Priority:** P1 · **Complexity:** S

**User Story:** As a player, I want a beautiful shareable card generated automatically after each matchday so I can share my result with one tap.

**Acceptance Criteria:**
- Card generated within 10 minutes of matchday points finalisation
- Includes: rank, GW points, total points, best player, captain return, chip used (if any) — all from real DB values (not hardcoded)
- Portrait-format, WC-branded, share-ready 1080×1920 PNG
- Shareable via native share sheet (WhatsApp, Instagram Stories, X)
- "Save to Camera Roll" fallback for iOS

**Dependencies:** FB-019 (recap real data), matchday points finalisation job

**Source:** Sleeper auto-transaction cards; FPL gameweek recap

**Notes:** The `RecapCard` component and `html2canvas` export already exist. Migrate to server-side rendering (`@vercel/og` edge function) for consistent cross-device output — client-side `html2canvas` breaks with custom fonts on some Android browsers.

---

### FB-029
**Title:** League chat — full real-time implementation (Sleeper model)

**Priority:** P1 · **Complexity:** M

**User Story:** As a league member, I want a persistent, real-time group chat in my league so that banter and trash talk happen inside the app, not on WhatsApp.

**Acceptance Criteria:**
- Chat tab in League screen sends and receives messages in real time (Supabase Realtime)
- The existing static mock message thread is replaced with live data from `league_chat_messages` table
- Messages support: text, emoji reactions (👍🔥💀😂), @mentions, GIF search (Giphy/Tenor)
- Message history: last 50 on load, infinite scroll up
- Read receipts shown as avatar stacks; basic profanity filter applied

**Dependencies:** FB-011, FB-002, league membership

**Source:** Code audit — chat tab has static hardcoded messages and a text input with no handler; Sleeper (defining competitive feature)

**Notes:** Chat is the highest single-feature retention driver in the Sleeper model — managers return daily even without transfers. The UI shell exists. This item wires it to a real backend. Implement message pagination on first load.

---

### FB-030
**Title:** Auto-transaction social cards in league chat

**Priority:** P1 · **Complexity:** S

**User Story:** As a league member, I want automatic posts in chat when a manager transfers a player, uses a chip, or changes captain so that every squad decision becomes a conversation trigger.

**Acceptance Criteria:**
- Transfer: "🔄 [Manager] transferred in [Player A], out [Player B]"
- Chip use: "⚡ [Manager] played the Knockout Gambler chip!"
- Captain change: "🎖 [Manager] switched captain to [Player]"
- Auto-posts rendered in a distinct system-message style (different background from chat bubbles)
- Not deletable; individually hideable by the recipient

**Dependencies:** FB-029

**Source:** Sleeper (defining mechanic — converts admin events into social moments)

**Notes:** Fire via Supabase database trigger or edge function on mutations to `transfers`, `team_chips`, `squads.captain_id`. Don't fire during the locked window. Keep copy under 140 characters.

---

### FB-031
**Title:** H2H mini-league matchups — full implementation

**Priority:** P1 · **Complexity:** M

**User Story:** As a player, I want to be matched against one opponent each matchday in a head-to-head format so that every gameweek has a direct rival to beat.

**Acceptance Criteria:**
- H2H schedule auto-generated on league creation (round-robin, handles odd manager counts with a bye)
- H2H standings tab in League screen alongside overall standings
- Live H2H score visible during match — my score vs opponent's, player breakdown on tap
- H2H result (W/D/L) recorded in `h2h_results` table post-matchday
- League admin can regenerate schedule before GW1

**Dependencies:** FB-015, league system

**Source:** Sleeper, FPL H2H leagues

**Notes:** Rival squad visibility must be locked until after the deadline — implement as an RLS policy on `squads`. This is the engagement flywheel: direct rivals are the single strongest reason to open the app during a match.

---

### FB-032
**Title:** Phase-based scoring and tournament chapter leaderboards

**Priority:** P1 · **Complexity:** S

**User Story:** As a player who had a bad group stage, I want separate leaderboards per tournament phase so that I still have something to compete for in the knockouts.

**Acceptance Criteria:**
- Leaderboard tabs: Group Stage, Round of 16, Quarter-Finals, Semi-Finals, Final
- Phase scores = sum of points within that phase's matchdays only
- Phase winner badge awarded on league profile at end of each phase
- Overall leaderboard remains the primary view; phase tabs are secondary
- Phase boundaries configurable in Admin screen

**Dependencies:** Matchday-phase mapping table, league standings

**Source:** Original WC-specific feature

**Notes:** Reuses existing standings query with a `WHERE matchday_id IN (...)` filter. This dramatically extends engagement past the group stage — implement even if other P1 items are delayed.

---

### FB-033
**Title:** H2H rival squad view — post-deadline read-only pitch view

**Priority:** P1 · **Complexity:** M

**User Story:** As a player in an H2H matchup, I want to see my opponent's full squad after the transfer deadline so I can analyse their picks and follow the head-to-head.

**Acceptance Criteria:**
- H2H view in League screen shows opponent's 11-player pitch view (read-only, no actions)
- Only visible after matchday deadline passes — shows "Locked — revealed at kick-off" before
- Captain and chip selections visible in opponent view
- Points scored by each opponent player update live during the match
- Toggle between "My Squad" / "Rival Squad" with a tab or swipe gesture

**Dependencies:** FB-031, FB-011 (Realtime), FB-009 (deadline lock)

**Source:** Code audit — LeagueScreen H2H sheet uses hardcoded `MOCK_SQUAD_PLAYERS`; Sleeper rival view

**Notes:** RLS policy: `squads` readable by league members only after `matchday_deadlines.deadline_at < now()`. This is also a privacy control — squads must not be readable before the deadline to prevent copying.

---

### FB-034
**Title:** Player form graph and stats card

**Priority:** P1 · **Complexity:** M

**User Story:** As a player evaluating a transfer target, I want to see a player's last 5 matches graphed so that my decisions are data-driven.

**Acceptance Criteria:**
- Player detail modal (Market + Squad screens) shows a bar/sparkline chart of last 5 GW points
- Key stats: goals, assists, clean sheets, yellow cards, average points, ownership %
- Form label (Hot / Good / Average / Poor / Cold) calculated from 5-match average vs season average
- Stats card shareable as an image
- "Insufficient data" state for GW1–2 when fewer than 2 matches played

**Dependencies:** `player_match_stats` table, live data provider, charting library

**Source:** FPL player stats; Sorare performance cards

**Notes:** Use `recharts` for the sparkline — React 19 compatible. The shareable stats card is an organic viral mechanic. World Cup has at most 7 matchdays per team so the graph will be sparse early.

---

### FB-035
**Title:** Admin analytics dashboard — DAU, funnel, and engagement metrics

**Priority:** P1 · **Complexity:** M

**User Story:** As the product team, I want a live admin dashboard showing key engagement metrics so that we can make data-driven decisions throughout the tournament.

**Acceptance Criteria:**
- Admin screen Metrics tab (admin-only): DAU, WAU, MAU, daily registrations, funnel (registered → squad saved → league joined → matchday active)
- Metrics from `analytics_events` table (client fires events on key actions)
- Retention cohort: % of day-0 registrations still active on day 7, 14, 21
- Top 10 leagues by activity (message count + transfer count)
- Refreshes every 5 minutes; data exportable

**Dependencies:** Analytics event instrumentation (add in FB-018 onboarding), Admin screen

**Source:** Internal product requirement

**Notes:** Instrument from day 1 — retrofitting analytics is painful. Use a simple `analytics_events(user_id, event_name, properties JSONB, created_at)` table rather than a third-party SDK. PostHog free tier is a viable alternative.

---

### FB-036
**Title:** Transfer deadline countdown push notifications

**Priority:** P1 · **Complexity:** S

**User Story:** As a player, I want push notifications before the transfer deadline so I don't miss my chance to make changes.

**Acceptance Criteria:**
- Notifications sent at T-24h, T-2h, T-30min before each matchday deadline
- T-30min push is personalised: "Deadline in 30 mins — [Player] is doubtful, consider a swap"
- Each notification type independently toggleable in user settings
- Notifications deep-link to Squad screen
- No notification sent if squad is already locked (user already submitted)

**Dependencies:** FB-019 (push infra), `matchday_deadlines` table, FB-010

**Source:** FPL deadline UX; Dream11 second-precision deadline notifications

**Notes:** T-30min is the highest-converting send. Trigger via Supabase edge function on a scheduled cron. Cap to 3 deadline notifications per matchday per user.

---

### FB-037
**Title:** Daily notification loop — morning news, kick-off, post-match

**Priority:** P1 · **Complexity:** M

**User Story:** As a player, I want relevant notifications at the right moment each day so the app stays top of mind without feeling spammy.

**Acceptance Criteria:**
- Morning (9am local): "Team news: [Player] is doubtful — consider a transfer"
- Kick-off: "🏟 Matchday X is live — your captain [Player] is starting"
- Post-match: "Full time — you scored X pts. You're now [rank] in your league"
- All 3 types independently toggleable in notification settings
- Maximum 4 notifications per day per user (T-2h deadline + 3 content notifications)

**Dependencies:** FB-019, team news data feed, scoring results

**Source:** FPL and Sleeper daily engagement patterns

**Notes:** Implement kick-off and post-match first (no external data feed needed). Morning team news requires a data provider — add in P2. The 4-notification cadence is proven in FPL to drive daily opens.

---

### FB-038
**Title:** Ownership percentage display and differential badges

**Priority:** P1 · **Complexity:** S

**User Story:** As a player, I want to see what percentage of managers own each player so that I can identify differentials and spot template picks.

**Acceptance Criteria:**
- Ownership % on every player card in Market and Squad screens
- Calculated as `(squads containing player) / (total squads) × 100`, refreshed every 15 minutes
- < 5% ownership → "Differential" badge; > 50% → "Template" badge
- Not shown for the viewing user's own players (avoid self-referential confusion)
- Cached in a `player_ownership` materialised view — not computed live per request

**Dependencies:** `squads` table, scheduled Supabase cron

**Source:** FPL; Sorare

**Notes:** High-engagement transparency feature — do not paywall it. The 15-minute cache is fine for the transfer window; no need for real-time precision here.

---

### FB-039
**Title:** Fixture Difficulty Rating (FDR) — colour-coded per player

**Priority:** P1 · **Complexity:** S

**User Story:** As a player planning transfers, I want to see how difficult each team's remaining fixtures are so that I can target players with easier upcoming matches.

**Acceptance Criteria:**
- FDR scores (1–5) per national team per remaining matchday, stored in `fixture_difficulty` table
- Colour band on player cards: 1–2 green, 3 amber, 4–5 red; next 3 fixtures shown
- Tooltip/tap shows opponent name + difficulty score
- FDR data updatable by admin without a code deploy

**Dependencies:** Fixture schedule, player–team mapping

**Source:** FPL (core FDR mechanic)

**Notes:** With 32 WC teams and 7 matches max, FDR is simpler and more static than club season FDR. Seed initial values from FIFA rankings before the tournament; update manually after group stage standings are set.

---

### FB-040
**Title:** Fixture Difficulty Rating (FDR) — colour-coded per player

**Priority:** P1 · **Complexity:** S

**User Story:** As a player planning transfers, I want to see how difficult each team's remaining fixtures are so I can target players in easy matches.

> ⚠️ **Note:** This item was accidentally duplicated. See FB-039. Remove FB-040 in next backlog review.

---

### FB-041
**Title:** Push notification infrastructure (web push + PWA service worker)

**Priority:** P1 · **Complexity:** L

**User Story:** As a player, I want to opt into push notifications so I'm reminded before deadlines and alerted when my captain scores.

**Acceptance Criteria:**
- Service worker registers and requests permission on first visit post-auth
- Supabase edge function sends push via Web Push API (VAPID)
- User manages notification preferences per type (deadline, captain goal, injury, chat) in profile settings
- Notifications deep-link to the relevant screen on tap
- Opt-out removes subscription from `push_subscriptions` table immediately

**Dependencies:** FB-017, auth

**Source:** FPL, Sleeper

**Notes:** VAPID keys stored in Supabase secrets. Test iOS 16.4+ web push constraints (requires app added to Home Screen on Safari). Cap to 3 push notifications per day per user. FB-036 and FB-037 depend on this.

---

### FB-042
**Title:** Deep-link routing for notifications and league invite links

**Priority:** P1 · **Complexity:** S

**User Story:** As a user who taps a notification or invite link, I want to land on the exact relevant screen, not the home page.

**Acceptance Criteria:**
- Push notifications carry a `target_url` that opens the correct screen on tap
- `/join?code=XXXX` pre-fills the join code on the Auth screen
- `/recap?matchday=5` opens the Recap screen directly
- Deep links work from cold start and warm start
- Tested on iOS Safari PWA, Android Chrome PWA, and desktop Chrome

**Dependencies:** FB-041, React Router

**Source:** Internal requirement

**Notes:** React Router handles warm-start deep links natively. Cold-start from push requires the service worker `notificationclick` handler to use `clients.openWindow(target_url)` correctly.

---

### FB-043
**Title:** Mobile-first layout polish and PWA install prompt

**Priority:** P1 · **Complexity:** M

**User Story:** As a mobile user, I want the app to feel native on my phone so that I recommend it to friends rather than looking for a native app.

**Acceptance Criteria:**
- All 9 screens render correctly on iPhone SE (375px), iPhone 14 (390px), and Samsung Galaxy S22 (360px)
- No horizontal scroll on any screen at any viewport
- PWA install prompt appears after the user's 3rd session or on manual trigger
- Custom splash screen, icon, and standalone mode in `manifest.json`
- Lighthouse PWA score > 90

**Dependencies:** All screens built

**Source:** Internal quality requirement

**Notes:** The Squad screen pitch view is the most complex responsive layout — test on real devices not just DevTools. iOS cannot force the install prompt — implement a custom "Add to Home Screen" modal guide for Safari users.

---

---

# P2 — Post-Launch
*Ship during the group stage or before Round of 16. Ordered by impact.*

---

### FB-044
**Title:** League stats view — real calculated data (replace hardcoded numbers)

**Priority:** P2 · **Complexity:** M

**User Story:** As a league member in the Stats tab, I want to see real league statistics, not cosmetic placeholder numbers.

**Acceptance Criteria:**
- Total squad value: sum of player prices across all league squads (from DB)
- Top scorer: player with highest points across all members' squads
- Most transferred player: most bought across the league this week (`transfers` table)
- Most captained player: selected as captain most often this matchday
- League average score: mean total points across all active members
- Stats refresh after each matchday finalisation

**Dependencies:** FB-002, scoring engine, `transfers` table

**Source:** Code audit — all stats in LeagueScreen stats view are hardcoded (e.g. "€1.4B squad value", "424 pts Mbappé")

**Notes:** Implement as Supabase views triggered post-matchday. These are high-shareability stats ("Mbappe was captained by 6 of 8 managers!") — prioritise the most viral ones first.

---

### FB-045
**Title:** Trade system — backend implementation or replace UI with "Coming Soon"

**Priority:** P2 · **Complexity:** L

**User Story:** As a league member, I want to propose and accept player trades with rivals so that the transfer market has a social negotiation layer.

**Acceptance Criteria:**
- Trade offer stored in `trade_offers` table: proposer_id, target_id, offered_players[], requested_players[], cash_adjustment, status
- Target user receives a push notification on proposal
- Accept / Reject buttons in League screen
- On acceptance, both squads updated atomically (DB transaction)
- Trades expire after 48 hours; cannot be proposed after matchday deadline

**Dependencies:** FB-029 (chat), FB-041 (push), `trade_offers` table

**Source:** Code audit — LeagueScreen trade UI is fully cosmetic; "João wants to trade…" is hardcoded; no DB or backend exists

**Notes:** **CRITICAL UX RISK:** Until this is built, the trade UI must be hidden from real users or replaced with "Coming Soon." Shipping a non-functional trade modal to production destroys trust. Add a feature flag to hide it.

---

### FB-046
**Title:** Bracket predictor — backend wiring and scoring

**Priority:** P2 · **Complexity:** M

**User Story:** As a player using the Bracket screen, I want my knockout predictions saved and scored against real results so the bracket is a real competition.

**Acceptance Criteria:**
- Bracket fixtures from `fixtures` table (knockout rounds), not hardcoded teams
- Tapping a team records the prediction in `bracket_predictions` table
- Bracket state persists across sessions
- Predictions auto-scored after each knockout match: correct winner = 1pt, correct scoreline = 3pts
- Bracket leaderboard tab in League screen

**Dependencies:** FB-002, knockout fixture data, `bracket_predictions` table

**Source:** Code audit — BracketScreen is entirely static; teams hardcoded (BRA, FRA, ENG, KOR); "Save Bracket" button has no onClick; nothing is persisted

**Notes:** Schedule for P2 — bracket predictions are only meaningful once knockout fixtures are set (after group stage). **Add "Preview — predictions coming soon" label at launch** so users know it's real.

---

### FB-047
**Title:** Match timeline event feed — real-time events in Live screen

**Priority:** P2 · **Complexity:** M

**User Story:** As a player on the Live screen, I want to see a real-time event feed (goals, cards, subs) so I understand why my score is changing.

**Acceptance Criteria:**
- Timeline events appear as feed items with timestamp (goal, assist, yellow card, red card, sub, penalty miss)
- Filterable: "My Players Only" vs "All Matches"
- Each event tappable to see the player's stat card
- Events from `match_events` table streamed via Supabase Realtime
- Feed auto-scrolls to latest event (pauseable)

**Dependencies:** FB-013, live data provider

**Source:** LaLiga Fantasy, ESPN FC

**Notes:** FB-013 covers the Realtime subscription wiring. This item covers the UI feed component and the filterable display layer. Requires the data provider to be writing events — this is the critical external dependency.

---

### FB-048
**Title:** Daily prediction mini-game — result and correct score picks

**Priority:** P2 · **Complexity:** M

**User Story:** As a player who wants more engagement on match days, I want to predict match results and correct scores so I have another way to compete with my league.

**Acceptance Criteria:**
- Prediction card on Home screen for today's matches (up to 4 per day in group stage)
- Predict result (1/X/2) and correct score (optional, higher reward)
- Points: result correct = 1pt, correct score = 3pts; tracked in separate "Prediction League" table
- Predictions locked at kick-off; correct score revealed post-match
- Separate prediction leaderboard in League screen

**Dependencies:** FB-020 (persist prediction), fixture data, results feed

**Source:** Superbru, SofaScore Predictor

**Notes:** The `top_scorer_predictions` table and flow from FB-020 provides the pattern — extend the schema. Keep prediction scoring separate from main fantasy scoring to avoid confusing the core product.

---

### FB-049
**Title:** Best Ball / Set-and-Forget game format

**Priority:** P2 · **Complexity:** M

**User Story:** As a casual fan who doesn't want to manage my team weekly, I want the app to automatically pick my best 11 each matchday from my squad so I can follow the tournament without active management.

**Acceptance Criteria:**
- "Best Ball" league type selectable at league creation
- System selects optimal 11 (highest-scoring eligible players) post-matchday via edge function
- Auto-selected lineup shown on Recap screen with "Auto-picked by ForzaKit" label
- No transfer deadline or weekly management in Best Ball mode
- Best Ball and Classic leagues co-exist; users can join both

**Dependencies:** Scoring engine, Supabase edge function

**Source:** Underdog Fantasy Best Ball; Sleeper Best Ball

**Notes:** Auto-pick algorithm: maximise total score subject to formation constraints (min 1 GK, 3 DEF, 2 MID, 1 FWD). Run as a post-matchday edge function trigger. Great for the WC casual audience who find weekly management intimidating.

---

### FB-050
**Title:** AI transfer assistant — rule-based recommendations with reasoning

**Priority:** P2 · **Complexity:** M

**User Story:** As a player unsure who to transfer, I want the app to suggest transfers with clear reasoning so I make better decisions faster.

**Acceptance Criteria:**
- "Get suggestions" CTA on Squad screen
- Recommendations based on: FDR (FB-039), form (FB-034), ownership trends (FB-038), injury status
- Each suggestion includes plain-language reasoning: "Bellingham has scored in 3 of his last 4 and faces a 2/5 difficulty fixture next"
- Maximum 3 suggestions shown per session
- User can accept (jumps to transfer with player pre-selected) or dismiss

**Dependencies:** FB-039 (FDR), FB-034 (form), FB-038 (ownership)

**Source:** Yahoo AI Assistant Manager; Dream11 Guru

**Notes:** Label as "rule-based suggestions" — not "AI" or "machine learning." Do NOT use an LLM pre-launch (latency, cost, hallucination risk). A weighted formula `(form × 0.4 + FDR × 0.3 + ownership trend × 0.3)` delivers 80% of the value with 10% of the complexity.

---

### FB-051
**Title:** Price change tracking and watchlist alerts

**Priority:** P2 · **Complexity:** S

**User Story:** As a player monitoring the market, I want to see price changes and get alerted for watchlisted players so I can act before prices move further.

**Acceptance Criteria:**
- Price change indicator on player cards (↑ +0.1m green / ↓ -0.1m red) since tournament start
- Star icon adds a player to personal watchlist
- Push notification when a watchlisted player's price changes
- Price history chart in player detail modal
- Prices updated by admin post-matchday; history stored in `player_price_history` table

**Dependencies:** FB-041 (push), `player_price_history` table

**Source:** FPL price changes

**Notes:** Prices in a WC format are manually set by admin (no algorithmic transfer-driven prices). The watchlist + notification combo is a strong re-engagement trigger for inactive users.

---

### FB-052
**Title:** League trophy cabinet and profile page

**Priority:** P2 · **Complexity:** S

**User Story:** As a returning champion, I want past league wins displayed on my profile so that my history is recognised and I'm motivated to return for the next tournament.

**Acceptance Criteria:**
- Profile screen shows "Trophy Cabinet" with one icon per league won
- Trophy includes: league name, tournament, year, manager's final score
- Awarded automatically when commissioner marks a season complete
- Visible to all league members
- "Runner-Up" and "Phase Winner" badges also awarded (visually distinct)

**Dependencies:** League standings finalisation, `trophies` table

**Source:** FPL hall of fame; Sleeper avatar system

**Notes:** World Cup is a one-shot tournament — trophies are especially meaningful as a permanent memento. Use WC-inspired visual design (golden cup, country flags). Store in a `trophies` table linked to `profiles`.

---

### FB-053
**Title:** League commissioner analytics dashboard

**Priority:** P2 · **Complexity:** M

**User Story:** As a league commissioner, I want aggregated league stats so I can understand who is active and keep managers engaged.

**Acceptance Criteria:**
- Commissioner-only view: active managers this GW, average score, highest score, template XI (most-owned 11 in the league)
- Weekly digest email to commissioner after each matchday (opt-in)
- Manager participation rate (% who changed team before deadline) as a health metric
- "Biggest mover" — manager who gained the most places this GW
- Data exportable as CSV

**Dependencies:** League system, matchday finalisation, Resend email integration

**Source:** Internal concept

**Notes:** Commissioners are power users and evangelists. The template XI is especially shareable ("6 of 8 managers own Mbappe!"). CSV export is low effort, high goodwill.

---

### FB-054
**Title:** Correct prediction streak tracker

**Priority:** P2 · **Complexity:** S

**User Story:** As a player using Daily Predictions, I want to see my correct-prediction streak so I'm motivated to predict every matchday.

**Acceptance Criteria:**
- Streak counter on Home screen prediction card
- Increments on correct prediction; breaks on a miss or no-pick
- `current_streak` and `best_streak` stored on `profiles` table
- Notification if a streak of 3+ is at risk: "Your 5-game streak is at risk — pick before 3pm"
- Streak badge on league standings next to manager name

**Dependencies:** FB-020 (persist prediction), FB-041 (push)

**Source:** Duolingo streak mechanic; FPL bonus engagement loops

**Notes:** The at-risk notification is more valuable than the visible counter — implement it even if the UI counter is deferred. Show the streak as an achievement; never punish streak loss aggressively.

---

### FB-055
**Title:** "X of your league mates own this player" social proof in Market

**Priority:** P2 · **Complexity:** S

**User Story:** As a player browsing the transfer market, I want to see how many of my league rivals own a player so I feel social pressure on template picks and spot differentials.

**Acceptance Criteria:**
- League-scoped ownership count on player cards in Market screen: "3 of 8 managers in your league own this player"
- Phrasing: 0 = "Unique in your league", 1–2 = "X manager owns…", 3+ = "X managers own…"
- Updates in real time during the transfer window
- Only shown when user is in at least one league
- Does not reveal which specific managers own the player (privacy until deadline)

**Dependencies:** FB-038 (global ownership %), league membership, squad data

**Source:** FPL template pressure; Sleeper social layer

**Notes:** Subtle but powerful — turns solitary browsing into a social experience. Compute per-league from existing squad data; cache at league level.

---

### FB-056
**Title:** Guest gameweek entry — no-commitment single matchday

**Priority:** P2 · **Complexity:** M

**User Story:** As a casual fan who doesn't want to commit to the full tournament, I want to enter a single matchday public contest so I can try the game without long-term obligations.

**Acceptance Criteria:**
- "Play this matchday" CTA on landing page requires only email (no full registration)
- Guest picks a squad for one matchday and enters a public leaderboard
- Post-matchday results email with CTA to create a full account and join a league
- Guest entry converts to full account on registration with same email
- Guest entries capped at 500 per matchday to manage volume

**Dependencies:** Auth (guest session), squad builder, public leaderboard

**Source:** DraftKings single-entry; WC casual audience strategy

**Notes:** The WC has a huge casual audience who'd never commit to FPL-style season management. Guest entry is the top-of-funnel activation for this segment. Conversion from guest to registered is the key metric — track it from day 1.

---

### FB-057
**Title:** Waiver wire / transfer priority system

**Priority:** P2 · **Complexity:** M

**User Story:** As a manager near the bottom of the standings, I want first priority on free-agent pickups so that lower-placed teams have a catch-up mechanism.

**Acceptance Criteria:**
- Waiver priority assigned inverse to league standings (last place = priority 1)
- Waiver window opens after results are finalised each matchday
- Claims submitted during window (not first-come-first-served)
- Claims processed in priority order via a Supabase edge function
- League admin can toggle waiver mode ON/OFF per league

**Dependencies:** League standings, transfer system, `waiver_claims` table

**Source:** Sleeper, NFL fantasy conventions

**Notes:** Only relevant for closed private leagues. Gate behind a league setting so classic leagues are unaffected.

---

### FB-058
**Title:** iOS Live Activities and home screen widget

**Priority:** P2 · **Complexity:** L

**User Story:** As an iPhone user, I want to see my live score on the Dynamic Island and lock screen during a match without opening the app.

**Acceptance Criteria:**
- Live Activity shows: my score, captain's points, H2H score (if applicable), time remaining
- Starts automatically at matchday kick-off
- Updates every 60s via ActivityKit push token
- Home screen widget (small + medium) shows current rank and total points
- Graceful degradation on Android (push notifications as fallback)

**Dependencies:** FB-041 (push), FB-011 (Realtime), native iOS wrapper

**Source:** Yahoo Fantasy (first to launch Live Activities in fantasy sports)

**Notes:** Requires a React Native wrapper or dedicated iOS companion — not achievable in a pure PWA. Defer if native strategy is not decided pre-launch. Use push notifications (FB-041) as interim.

---

### FB-059
**Title:** Player watchlist with transfer alerts

**Priority:** P2 · **Complexity:** S

> ⚠️ Merged into FB-051 (Price change tracking and watchlist alerts). Remove in next backlog review.

---

---

# P3 — Future / v2 Roadmap

---

### FB-060
**Title:** Snake draft mode — live real-time draft night

**Priority:** P3 · **Complexity:** XL

**User Story:** As a league commissioner, I want to run a live draft night where managers take turns picking players so that squad building is a shared social event.

**Acceptance Criteria:**
- Draft lobby with ready-check before starting
- Turns time-limited (60s default, configurable); auto-pick fires on timeout
- Real-time pick feed visible to all managers simultaneously via Supabase Realtime
- Draft results seed each manager's squad automatically
- Commissioner can pause, resume, or reset draft before completion

**Dependencies:** FB-011 (Realtime), league system, full player database

**Source:** Sleeper (best draft UX in industry); ESPN Fantasy

**Notes:** Highest complexity item in the backlog — do not attempt pre-launch or mid-tournament. Requires WebSocket presence tracking, clock synchronisation, and conflict resolution for simultaneous picks. Build as a standalone `/draft/:league_id` route. Post-tournament Phase 2 item.

---

## Known Risks

1. **Live data provider** — FB-012, FB-013, FB-034, FB-047 all depend on a contracted real-time sports data provider. Evaluate and sign with Sportmonks or API-Football by **May 1, 2026** — this is the hardest external dependency.
2. **iOS push notifications** — Web push on iOS requires iOS 16.4+ and the app added to Home Screen. Communicate this constraint clearly in onboarding. Affects FB-041.
3. **Supabase Realtime scale** — Pro tier allows 500 concurrent connections. Load test at 200 concurrent users on a simulated matchday before launch. Affects FB-011.
4. **Server-side Gazette card rendering** — `html2canvas` client-side rendering is fragile on Android with custom fonts. Migrate to `@vercel/og` edge function before launch. Affects FB-028.
5. **Trade UI ships non-functional** — The trade modal in LeagueScreen currently does nothing. **Must be hidden behind a feature flag or replaced with "Coming Soon" before any real user sees it.** Affects FB-045.
6. **Bracket screen is entirely cosmetic** — Teams hardcoded, no predictions saved. Add "Preview — coming in Round of 16" label at launch. Affects FB-046.
7. **Recap card shows wrong user data** — "João scored 15 pts for World Cup Legends" will be the first thing a real user sees and will never be shared. FB-019 must ship before launch.

---

*Backlog maintained by: Product / Engineering*
*Code audit completed: April 20, 2026 — 20 logic gaps identified (FB-002, FB-006–FB-008, FB-019–FB-025, FB-029, FB-033, FB-044–FB-047)*
*Next review: Sprint planning, week of May 4, 2026*
