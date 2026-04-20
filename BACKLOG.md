# ForzaKit — Product Backlog
## World Cup 2026 Fantasy Football Platform

**Stack:** React 19 + Supabase | **Target Launch:** June 2026 | **Current build:** ~80% complete

> Backlog last updated: 2026-04-20. Items are organised by Epic, then Priority (P0 → P3).
> Complexity scale: XS (< 0.5 day) · S (0.5–1 day) · M (2–3 days) · L (4–7 days) · XL (> 1 week)

---

## Priority Legend

| Label | Meaning |
|-------|---------|
| **P0** | Pre-launch blocker — must ship before go-live |
| **P1** | Launch window — ships within first 2 weeks of tournament |
| **P2** | Post-launch — next phase, ships during group stage |
| **P3** | Future — post-tournament or v2 roadmap |

---

## Epic Index

1. [Platform & Infrastructure](#epic-platform--infrastructure)
2. [Game Mechanics](#epic-game-mechanics)
3. [Live Experience](#epic-live-experience)
4. [Social & Community](#epic-social--community)
5. [Onboarding & Growth](#epic-onboarding--growth)
6. [Data & Analytics](#epic-data--analytics)

---

## Epic: Platform & Infrastructure

### FB-001
**Title:** Supabase real-time subscriptions for live scoring

**Priority:** P0

**User Story:** As a player, I want the app to automatically update my score during a match without refreshing so that I can follow the action live.

**Acceptance Criteria:**
- Supabase Realtime channel subscribes to `player_scores` table on Live screen mount
- Score deltas render within 60 seconds of a goal event being written to the DB
- Subscription cleanly unsubscribes on screen unmount (no memory leaks)
- Offline/reconnect state handled gracefully with a "Reconnecting…" banner
- Works on both desktop and mobile Chrome/Safari

**Complexity:** M

**Dependencies:** `player_scores` table schema finalised, Supabase Realtime enabled on project

**Source:** LaLiga Fantasy (sub-60s live update model)

**Notes:** Enable Supabase Realtime replication on the `player_scores` table. Consider a polling fallback (every 90s) for browsers that block WebSockets on restricted networks. Budget for Supabase Realtime connection limits at scale — evaluate pgBouncer settings.

---

### FB-002
**Title:** Transfer deadline lock enforcement (server-side)

**Priority:** P0

**User Story:** As a league commissioner, I want the server to hard-lock transfers at the matchday deadline so that no team can gain an unfair advantage from late edits.

**Acceptance Criteria:**
- Supabase edge function validates transfer timestamp against `matchday_deadlines` table before writing
- UI reflects locked state immediately when deadline passes (transfer button disabled, lock icon shown)
- Any in-flight transfer submitted after deadline returns a 403 with user-friendly error toast
- Admin panel can override deadline per matchday
- Unit tests cover lock boundary (1 second before / 1 second after)

**Complexity:** M

**Dependencies:** `matchday_deadlines` table, Admin screen

**Source:** FPL, internal requirement

**Notes:** Do NOT enforce deadline solely client-side — trivial to bypass. Edge function must be the single source of truth. Store deadlines in UTC; convert to user's local time only in the UI.

---

### FB-003
**Title:** Push notification infrastructure (web push + PWA)

**Priority:** P0

**User Story:** As a player, I want to opt in to push notifications so that I am reminded before deadlines and alerted when my captain scores.

**Acceptance Criteria:**
- Service worker registers and requests permission on first visit post-auth
- Supabase edge function triggers push via Web Push API for defined notification types
- User can manage notification preferences per type (deadline, captain goal, injury, league chat) from profile settings
- Notifications deep-link into the relevant screen on tap
- Opt-out removes subscription from `push_subscriptions` table immediately

**Complexity:** L

**Dependencies:** FB-001, auth system, Supabase edge functions

**Source:** FPL, Sleeper

**Notes:** VAPID keys must be generated and stored securely in Supabase secrets. Respect iOS 16.4+ web push constraints — test on Safari. Do not send more than 3 push notifications per day per user to avoid churn; implement daily send-rate cap in the edge function.

---

### FB-004
**Title:** Row-level security (RLS) audit and hardening

**Priority:** P0

**User Story:** As a user, I want my squad and transfer data to be private so that rival managers cannot query my team before the deadline.

**Acceptance Criteria:**
- All Supabase tables have RLS policies enabled and documented
- `squads` and `transfers` rows are only readable by the owning user and league commissioners until deadline passes
- `player_scores` and `player_stats` are publicly readable (no auth required for read)
- Penetration test checklist completed and signed off pre-launch
- No anon key used for any write operation

**Complexity:** M

**Dependencies:** Supabase project setup

**Source:** Internal security requirement

**Notes:** Run `supabase inspect db` and review policy output before launch. Pay special attention to admin-only tables — use a `is_admin` boolean on the `profiles` table, not a separate role, to keep queries simple.

---

### FB-005
**Title:** Error boundary and crash reporting

**Priority:** P0

**User Story:** As the development team, I want unhandled React errors to be caught and reported so that we can fix production crashes before users complain.

**Acceptance Criteria:**
- React ErrorBoundary wraps all top-level screen components
- Fallback UI shown on crash with "Reload" CTA — no white screen of death
- Errors posted to Sentry (or equivalent) with user ID, screen name, and stack trace
- Alert fires to team Slack channel if error rate exceeds 1% of sessions in 5 minutes
- Source maps uploaded to Sentry as part of CI/CD build step

**Complexity:** S

**Dependencies:** CI/CD pipeline

**Source:** Internal quality requirement

**Notes:** Use React 19's `useErrorBoundary` hook pattern. Sentry free tier is sufficient for launch volume. Scrub PII before sending to Sentry — user ID (UUID) is fine; email is not.

---

### FB-006
**Title:** CI/CD pipeline with Vercel preview deployments

**Priority:** P0

**User Story:** As a developer, I want every PR to deploy a preview environment so that QA can test features before merging to main.

**Acceptance Criteria:**
- GitHub Actions workflow runs lint, unit tests, and Playwright smoke tests on every PR
- Vercel preview URL posted automatically as a PR comment
- Main branch auto-deploys to production on merge
- Supabase migration runs automatically against staging branch on PR open
- Build fails if any test fails — no manual override path

**Complexity:** M

**Dependencies:** Vercel project, Supabase branching enabled

**Source:** Internal DevOps requirement

**Notes:** Use Supabase branching (available on Pro tier) to get per-PR DB environments. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables scoped to preview/production separately.

---

## Epic: Game Mechanics

### FB-007
**Title:** World Cup phase chips — Group Stage Rush & Knockout Gambler

**Priority:** P0

**User Story:** As a player, I want chips specific to World Cup tournament phases so that the game rewards strategic risk-taking tied to how the tournament actually works.

**Acceptance Criteria:**
- **Group Stage Rush:** doubles points from Group Stage matchdays 1–3; can only be played once during group phase
- **Knockout Gambler:** triples captain points but zeroes bench boost for that matchday; available from Round of 16 onward
- Chip state persisted in `team_chips` table (played_matchday, chip_type)
- Chip cards rendered in Squad screen chips tray with locked state after use
- Chips cannot be stacked with each other in the same matchday (server validation)

**Complexity:** S

**Dependencies:** Existing chip system (Daily Joker, Captain Roulette), `matchday_deadlines` table

**Source:** FPL (chip system pattern), original feature for WC context

**Notes:** Add `chip_type` enum values to DB migration. Display chips greyed out with "Used in GW X" label post-play. Copy should be World Cup themed — avoid generic football language.

---

### FB-008
**Title:** Fixture Difficulty Rating (FDR) colour coding

**Priority:** P1

**User Story:** As a player planning transfers, I want to see how difficult each team's remaining fixtures are so that I can target players with easy upcoming matches.

**Acceptance Criteria:**
- FDR scores (1–5) calculated per national team per remaining matchday, stored in `fixture_difficulty` table
- Player cards in the Market and Squad screens show a colour band (green → red) for next 3 fixtures
- Colour scale: 1–2 green, 3 amber, 4–5 red
- FDR tooltip on hover/tap shows opponent name and difficulty score
- FDR data updatable by admin without code deploy (editable in Admin screen)

**Complexity:** S

**Dependencies:** Fixture schedule table, player–team mapping

**Source:** FPL (core FDR feature)

**Notes:** For a 32-team World Cup, every team plays at most 7 matches. FDR is more static than in a club season — seed initial values pre-tournament based on FIFA rankings and update after each group stage result.

---

### FB-009
**Title:** Ownership percentage display and differential badges

**Priority:** P1

**User Story:** As a player, I want to see what percentage of managers in the game own each player so that I can identify differentials and make contrarian picks.

**Acceptance Criteria:**
- Ownership % displayed on every player card in Market and Squad screens
- Calculated as: (squads containing player) / (total squads) × 100, refreshed every 15 minutes
- Players owned by < 5% of managers show a "Differential" badge
- Players owned by > 50% show a "Template" badge
- Ownership data not shown for players on the user's own squad (to avoid self-referential confusion)

**Complexity:** S

**Dependencies:** `squads` table with player arrays, scheduled job (Supabase cron or edge function)

**Source:** FPL, Sorare

**Notes:** Materialise ownership % in a `player_ownership` view or scheduled function — do not compute live per request. Cache result in Supabase or React Query with 15-minute TTL. This is a high-engagement transparency feature; do not hide it behind a paywall.

---

### FB-010
**Title:** Transfer deadline countdown with pressure UX

**Priority:** P1

**User Story:** As a player, I want a visible countdown to the transfer deadline so that I am not caught out by the lock and feel urgency to finalise my team.

**Acceptance Criteria:**
- Countdown timer visible on Squad screen header and Home screen matchday card when < 24 hours remain
- Timer turns amber at T-2h, red at T-30min
- Push notifications sent at T-24h, T-2h, T-30min (respects user notification preferences from FB-003)
- Countdown disappears and lock state shown after deadline passes
- Timer derived from server time (not client clock) to prevent manipulation

**Complexity:** S

**Dependencies:** `matchday_deadlines` table, FB-003 (push notifications)

**Source:** FPL, internal UX pattern

**Notes:** Fetch server timestamp from Supabase `now()` on screen mount and derive countdown from that delta. Do not trust `Date.now()` alone. T-30min push is the highest-converting send — prioritise this one if push infrastructure is delayed.

---

### FB-011
**Title:** H2H mini-league matchups

**Priority:** P1

**User Story:** As a player, I want to be matched against one opponent each matchday in a head-to-head format so that every gameweek has a direct rival to beat.

**Acceptance Criteria:**
- H2H schedule auto-generated on league creation (round-robin for up to 16 managers)
- H2H standings table alongside overall standings in League screen (tab switcher)
- Live H2H score visible during a match — my score vs opponent's score, with player-level breakdown on tap
- H2H result (W/D/L) recorded in `h2h_results` table post-matchday
- League admin can regenerate schedule before GW1

**Complexity:** M

**Dependencies:** League system, live scoring (FB-001)

**Source:** Sleeper, FPL (H2H leagues)

**Notes:** Round-robin generation algorithm must handle odd numbers of managers (bye week for one manager). Display rival's live squad in a read-only view — this is the single highest-engagement feature in the Sleeper model. Lock opponent's team visibility until after deadline to prevent copying.

---

### FB-012
**Title:** Phase-based scoring and tournament chapter leaderboards

**Priority:** P1

**User Story:** As a player who joined late or had a bad group stage, I want separate leaderboards per tournament phase so that I still have something to compete for in the knockout rounds.

**Acceptance Criteria:**
- Separate leaderboard tabs for: Group Stage, Round of 16, Quarter-Finals, Semi-Finals, Final
- Phase scores calculated as sum of points within that phase's matchdays only
- Phase winner badge awarded on league profile at end of each phase
- Overall leaderboard remains the primary table; phase tables are secondary tabs
- Phase boundaries configurable in Admin screen

**Complexity:** S

**Dependencies:** Matchday–phase mapping table, League screen

**Source:** Original feature for WC tournament structure

**Notes:** This dramatically extends engagement past the group stage — implement even if other P1 features are delayed. Phase leaderboards can reuse existing standings query with a `WHERE matchday_id IN (...)` filter.

---

### FB-013
**Title:** Best Ball / Set-and-Forget game format

**Priority:** P2

**User Story:** As a casual fan who doesn't want to manage my team weekly, I want the app to automatically pick my best 11 each matchday from my 20-player squad so that I can enjoy the game without active management.

**Acceptance Criteria:**
- Separate "Best Ball" league type selectable at league creation
- System selects optimal 11 (highest-scoring eligible players) from squad after matchday finishes
- Auto-selected lineup shown on Recap screen with "Auto-picked by ForzaKit" label
- No transfer deadline or weekly management required in Best Ball mode
- Best Ball and Classic leagues co-exist in the same app; user can join both

**Complexity:** M

**Dependencies:** Scoring engine, Supabase edge function for auto-lineup calculation

**Source:** Sleeper Best Ball, Underdog Fantasy

**Notes:** Great for World Cup casual audience — lower commitment lowers churn. Auto-pick algorithm: maximise total score subject to formation constraints (min 1 GK, 3 DEF, 2 MID, 1 FWD). Run as a Supabase edge function triggered post-matchday.

---

### FB-014
**Title:** Waiver wire / transfer priority system

**Priority:** P2

**User Story:** As a manager near the bottom of the standings, I want first priority on free-agent pickups so that lower-placed teams get a catch-up mechanism.

**Acceptance Criteria:**
- Waiver priority assigned inverse to league standings (last place gets priority 1)
- Waiver window opens after each matchday's results are finalised
- Waiver claims submitted during window (not first-come-first-served)
- Claims processed in priority order; player goes to highest-priority claimant
- Waiver priority resets periodically (configurable by league admin)

**Complexity:** M

**Dependencies:** League standings, transfer system, `waiver_claims` table

**Source:** Sleeper, NFL fantasy conventions

**Notes:** More relevant for closed private leagues than public ones. Gate this behind a league-admin setting ("Waiver Mode: ON/OFF") so classic leagues aren't affected. Processing job runs as a Supabase edge function on a scheduled trigger.

---

### FB-015
**Title:** Snake draft mode

**Priority:** P3

**User Story:** As a league commissioner, I want to run a live real-time draft night where managers take turns picking players so that squad building is a shared social event.

**Acceptance Criteria:**
- Draft lobby with ready-check before draft starts
- Turns time-limited (60s default, configurable); auto-pick fires if manager doesn't pick in time
- Real-time pick feed shown to all managers simultaneously via Supabase Realtime
- Draft results seed each manager's squad automatically
- Commissioner can pause, resume, or reset draft before it completes

**Complexity:** XL

**Dependencies:** FB-001 (Realtime), league system, full player database

**Source:** Sleeper, ESPN Fantasy

**Notes:** Highest complexity item in the backlog — do not attempt pre-launch. Requires websocket presence, clock synchronisation, and conflict resolution for simultaneous picks. Build as a standalone `/draft/:league_id` route. Phase 2 roadmap item.

---

## Epic: Live Experience

### FB-016
**Title:** Live scoring screen with per-player stat breakdown

**Priority:** P0

**User Story:** As a player watching a match, I want to see each player's live points contribution so that I know exactly why my score is moving.

**Acceptance Criteria:**
- Live screen shows each player's current points with stat breakdown (goals, assists, clean sheet, bonus)
- Points update within 60s of a scoring event (leverages FB-001)
- Players with active bonus points shown with a pulsing indicator
- Captain points displayed at 2× (or active chip multiplier)
- "Last updated X seconds ago" timestamp shown to build trust in data freshness

**Complexity:** M

**Dependencies:** FB-001 (Realtime), `player_scores` table with stat columns

**Source:** LaLiga Fantasy, FPL live view

**Notes:** Stats breakdown is the single most-requested live feature in user research. Even if data is 60s delayed, the breakdown is what matters. Use Supabase Realtime subscription on `player_scores` filtered to the user's active squad players only to minimise payload.

---

### FB-017
**Title:** Rival live score visible in H2H view

**Priority:** P1

**User Story:** As a player in an H2H matchup, I want to see my opponent's live score updating alongside mine so that I feel the tension of the head-to-head contest in real time.

**Acceptance Criteria:**
- H2H live view shows two columns: My Score vs Opponent Score
- Both scores update on the same Realtime subscription
- Opponent's goalscorers listed by name with points contributed (no squad composition revealed before deadline)
- Win/Draw/Loss indicator updates live
- Tapping an opponent's player name shows their public stats card (not their full squad)

**Complexity:** M

**Dependencies:** FB-001, FB-011 (H2H system), FB-016

**Source:** Sleeper (rival view), FPL (mini-league live)

**Notes:** This is the engagement flywheel — managers check the app 5× more during matches when an H2H rival is visible. Prioritise rendering performance; avoid full re-renders on each score update (use React 19 transitions or memo).

---

### FB-018
**Title:** iOS Live Activities and home screen widget

**Priority:** P2

**User Story:** As an iPhone user, I want to see my live score on the Dynamic Island and lock screen during a match without opening the app so that I can follow along during the game.

**Acceptance Criteria:**
- Live Activity displays: my current score, captain's points, H2H score (if applicable), time remaining
- Activity starts automatically when a matchday kicks off (or on user tap)
- Updates every 60s via ActivityKit push token
- Home screen widget (small + medium sizes) shows current rank and total points
- Graceful degradation on Android (no Live Activity; rely on push notifications)

**Complexity:** L

**Dependencies:** FB-001, FB-003, native iOS wrapper (PWA or React Native bridge)

**Source:** Premier Fantasy, Sky Sports

**Notes:** Requires either a React Native wrapper or a dedicated iOS native companion — not achievable in a pure PWA. Assess whether the user base justifies native development pre-launch. If not, defer to P3 and use push notifications as the interim solution. Tag as P2 pending native strategy decision.

---

### FB-019
**Title:** Post-match automated Gazette story card

**Priority:** P1

**User Story:** As a player, I want a beautiful shareable story card generated automatically after each matchday so that I can brag (or commiserate) on social media with one tap.

**Acceptance Criteria:**
- Gazette card generated within 10 minutes of matchday points finalisiation
- Card includes: rank, GW points, total points, best player, captain return, chip used (if any)
- Design is portrait-format, World Cup branded, share-ready (1080×1920 PNG)
- Shareable via native share sheet (WhatsApp, Instagram Stories, X/Twitter)
- "Save to Camera Roll" fallback for iOS where navigator.share is restricted

**Complexity:** S

**Dependencies:** Matchday points finalisation job, html2canvas or server-side card render

**Source:** Sleeper (auto transaction cards), FPL (gameweek recap)

**Notes:** Already partially built — `RecapCard` component exists with html2canvas. Upgrade to server-side rendering (Supabase edge function + Puppeteer or `@vercel/og`) for consistent cross-device output. Client-side html2canvas is fragile with custom fonts.

---

### FB-020
**Title:** Match timeline event feed

**Priority:** P2

**User Story:** As a player watching the live screen, I want to see a real-time event feed (goals, cards, subs) so that I understand why my score is changing.

**Acceptance Criteria:**
- Timeline events (goal, assist, yellow card, red card, sub, penalty miss) appear as feed items with timestamp
- Events from all active World Cup matches shown, filterable to "My Players Only"
- Each event tappable to see the player's stat card
- Events stored in `match_events` table and streamed via Supabase Realtime
- Feed auto-scrolls to latest event (pauseable)

**Complexity:** M

**Dependencies:** FB-001, data provider integration for live event feed

**Source:** LaLiga Fantasy, ESPN FC

**Notes:** Requires a reliable live data feed. Evaluate: Sportmonks API, API-Football, or Football-Data.org for WC 2026 data rights. Budget €50–200/month for a data provider at tournament volume. This is a data dependency risk — resolve before P1 launch.

---

## Epic: Social & Community

### FB-021
**Title:** League chat hub (Sleeper model)

**Priority:** P1

**User Story:** As a league member, I want a persistent chat room in my league so that the banter, trash talk, and celebration happen inside the app rather than on WhatsApp.

**Acceptance Criteria:**
- Chat tab in League screen with persistent message history
- Messages support text, emoji reactions (thumbs up, fire, skull, laughing), and @mentions
- GIF search integration (Giphy or Tenor API)
- Messages stored in `league_chat_messages` table, streamed via Supabase Realtime
- Read receipts shown as avatar stacks on each message

**Complexity:** M

**Dependencies:** FB-001 (Realtime), auth system, league membership

**Source:** Sleeper (defining feature)

**Notes:** Chat is the single highest-retention feature in the Sleeper model — managers return daily even without transfers due to chat. Implement message pagination (load last 50, infinite scroll up). Moderate for offensive content — even basic profanity filter is better than none pre-launch.

---

### FB-022
**Title:** Auto-transaction social cards in league chat

**Priority:** P1

**User Story:** As a league member, I want to see automatic posts in chat when a manager makes a transfer, uses a chip, or switches captain so that the league stays informed and banter flows naturally.

**Acceptance Criteria:**
- Transfer event posts: "🔄 [Manager] transferred in [Player A] and out [Player B]"
- Chip event posts: "[Manager] played the Knockout Gambler chip this matchday!"
- Captain change posts: "[Manager] switched captain to [Player]"
- Auto-posts appear as a distinct system message style (different background colour from chat bubbles)
- Auto-posts are not deletable but can be hidden by the individual user

**Complexity:** S

**Dependencies:** FB-021 (chat), transfer system, chip system

**Source:** Sleeper (auto-transaction posts)

**Notes:** Fire auto-posts via Supabase database trigger or edge function on `transfers`, `team_chips`, and `squad_captains` table mutations. Do not post during the deadline lock window (after lock = no more auto-posts until results). Keep copy punchy — max 140 characters.

---

### FB-023
**Title:** League invite cards (WhatsApp / Instagram shareable)

**Priority:** P1

**User Story:** As a league commissioner, I want to generate a shareable image card with my league's join code so that I can recruit friends with a single message rather than typing instructions.

**Acceptance Criteria:**
- One-tap generate invite card from League screen (commissioner and all members can generate)
- Card includes: league name, join code, QR code, ForzaKit branding, and WC 2026 visual
- Shared via native share sheet or copied as PNG + text
- Deep link in card resolves to `/join?code=XXXX` which pre-fills the join code on Auth screen
- Cards invalidated when league is full or commissioner closes registration

**Complexity:** S

**Dependencies:** League system, auth deep-link handling

**Source:** Sleeper, FPL (share-link pattern)

**Notes:** Use `@vercel/og` or a pre-rendered template to generate the card server-side for consistent rendering. QR code library: `qrcode.react` (already common in React ecosystems). Deep links must work even if the app isn't installed yet (land on web auth → join flow).

---

### FB-024
**Title:** League trophy cabinet on profile

**Priority:** P2

**User Story:** As a returning champion, I want my past league wins displayed permanently on my profile so that my history is recognised and I have long-term motivation to return for the next tournament.

**Acceptance Criteria:**
- Profile screen shows a "Trophy Cabinet" section with one trophy icon per league won
- Trophy includes: league name, season/tournament, year, and manager's final score
- Trophy awarded automatically when league commissioner marks a season as complete
- Trophies visible to all league members (public profile view)
- "Runner-Up" and "Phase Winner" badges also awarded (visually distinct from champion trophy)

**Complexity:** S

**Dependencies:** League standings finalisation, profile screen, `trophies` table

**Source:** FPL (hall of fame pattern), Sleeper

**Notes:** World Cup 2026 is a one-shot tournament — trophies are especially meaningful as a permanent memento. Store trophy data in a `trophies` table linked to `profiles`. Design trophies to feel premium — use WC-inspired visual language (golden cup, country flags).

---

### FB-025
**Title:** Correct prediction streak tracker

**Priority:** P2

**User Story:** As a player who uses the Daily Prediction mini-game, I want to see my current correct-prediction streak so that I am motivated to keep predicting every matchday.

**Acceptance Criteria:**
- Streak counter displayed prominently on Home screen prediction card
- Streak increments when the user's prediction is correct and breaks on a miss or no-pick
- "Best streak" record stored alongside current streak on `profiles` table
- Notification sent if a user breaks a streak of 3 or more ("Your 5-game streak is at risk! Pick a scorer before 3pm")
- Streak badge shown on league standings next to manager name

**Complexity:** S

**Dependencies:** Top scorer prediction system (FB-007 already built), FB-003 (push notifications)

**Source:** Duolingo (streak mechanic), FPL (bonus engagement loops)

**Notes:** Streaks are a proven daily-active-user driver. The risk-notification is the most valuable piece — implement even if the visible streak counter is deferred. Store `current_streak`, `best_streak`, `last_correct_matchday` on `profiles`.

---

### FB-026
**Title:** "X of your league mates own this player" social proof

**Priority:** P2

**User Story:** As a player browsing the transfer market, I want to see how many of my league rivals own a player so that I feel social pressure to act on template players and spot differentials.

**Acceptance Criteria:**
- League-scoped ownership count shown on player cards in Market screen ("3 of 8 managers in your league own this player")
- Count updates in real-time when page is open during the transfer window
- Phrasing changes dynamically: 0 = "Unique in your league", 1–2 = "X manager owns…", 3+ = "X managers own…"
- Only shown when user is in at least one league; hidden for solo users
- Does not reveal which specific managers own the player (respects team privacy until deadline)

**Complexity:** S

**Dependencies:** FB-009 (ownership %), league membership, player–squad mapping

**Source:** FPL (template pressure), Sleeper social layer

**Notes:** This is a subtle but powerful retention hook — it turns a solitary browsing experience into a social one. Compute per-league from existing squad data. Cache at league level, not global level.

---

## Epic: Onboarding & Growth

### FB-027
**Title:** Onboarding flow — new user welcome and squad builder walkthrough

**Priority:** P0

**User Story:** As a new user, I want a guided walkthrough when I first arrive so that I understand how to build my squad and join a league without reading documentation.

**Acceptance Criteria:**
- 4-step onboarding: (1) Welcome + tournament context, (2) Pick your squad, (3) Join or create a league, (4) Set notifications preference
- Progress indicator shown throughout (step X of 4)
- Skippable at any step; skip stores a flag so it never shows again
- Walkthrough tooltips overlay Squad and Market screens on first visit
- Onboarding completion tracked in analytics (funnel drop-off by step)

**Complexity:** M

**Dependencies:** Auth, squad builder, league system

**Source:** Sleeper (polished onboarding), Draftkings

**Notes:** First-session completion rate is the single most predictive metric for 30-day retention. Target > 70% completion rate. Use a lightweight tooltip library (e.g. `react-joyride`) rather than building custom. A/B test skip vs. forced completion on step 2.

---

### FB-028
**Title:** Guest gameweek entry (no-commitment single matchday)

**Priority:** P2

**User Story:** As a casual fan who doesn't want to commit to the full tournament, I want to enter a single matchday public contest so that I can try the game without long-term obligations.

**Acceptance Criteria:**
- "Play this matchday" CTA on landing page requires only email (no full registration)
- Guest picks a squad for one matchday and is entered into a public leaderboard
- Post-matchday, guest receives results email with CTA to create a full account and join a league
- Guest entry converts to full account if user registers with same email
- Guest entries capped at 500 per matchday to manage data volume

**Complexity:** M

**Dependencies:** Auth (guest session), squad builder lite, public leaderboard

**Source:** DraftKings (single-entry), original concept for WC casual audience

**Notes:** World Cup has a uniquely large casual audience who would never commit to FPL-style season management. Guest entry is the top-of-funnel activation for this segment. Conversion from guest to registered is the key metric — track it from day 1.

---

### FB-029
**Title:** Social sharing — auto-generated WhatsApp league invite loop

**Priority:** P1

**User Story:** As an existing manager, I want the app to prompt me to invite friends at key moments so that my league fills up and engagement increases.

**Acceptance Criteria:**
- Invite prompt appears after: squad first saved, first matchday results, after a big captain return
- Prompt shows a pre-filled WhatsApp share link ("I scored X pts this week on ForzaKit — join my league: [link]")
- Invite CTA dismissable (does not appear again within 48 hours after dismissal)
- Conversion tracked: link clicks, registrations from invite links (UTM parameters)
- Manager rewarded with a cosmetic badge if they successfully recruit 3+ league members

**Complexity:** S

**Dependencies:** FB-023 (league invite cards), analytics tracking

**Source:** Wordle viral loop, Sleeper friend invites

**Notes:** The WhatsApp message pre-fill is the key mechanic — remove any friction. Use `https://wa.me/?text=` URL scheme. Attach UTM params (`?utm_source=invite&utm_medium=whatsapp&utm_campaign=matchday_result`) to all invite links.

---

### FB-030
**Title:** Daily notification loop (morning news, pre-deadline, live, post-match)

**Priority:** P1

**User Story:** As a player, I want relevant notifications at the right moment each day during the tournament so that the app stays top of mind without feeling spammy.

**Acceptance Criteria:**
- Morning (9am local): "Team news: [Player] is doubtful for today's match — consider a transfer"
- Pre-deadline (T-2h): "⏰ Transfer deadline in 2 hours — your team is [locked/not locked]"
- Match kick-off: "🏟 Matchday X is live — your captain [Player] is starting"
- Post-match: "Full time — you scored X pts. [League position change]"
- Each notification type independently toggleable in user settings (FB-003)

**Complexity:** M

**Dependencies:** FB-003 (push infrastructure), team news data feed, scoring results

**Source:** FPL, Sleeper daily engagement patterns

**Notes:** The 4-notification cadence mirrors TV sports coverage pacing and is proven in FPL to drive daily opens. Morning team news requires a data feed — flag as a data dependency. Implement T-2h and post-match first (no data feed required); add morning news in P2.

---

## Epic: Data & Analytics

### FB-031
**Title:** Player form graph and stats card

**Priority:** P1

**User Story:** As a player evaluating a transfer target, I want to see a player's last 5 matches performance graphed so that my decisions are data-driven rather than gut-feel.

**Acceptance Criteria:**
- Player detail modal (accessible from Market and Squad screens) shows a bar/spark-line chart of last 5 GW points
- Key stats displayed: goals, assists, clean sheets, yellow cards, average points, ownership %
- "Form" label (Hot / Good / Average / Poor / Cold) calculated from 5-match average vs. season average
- Stats card shareable as an image (same share flow as Gazette card)
- Data sourced from `player_match_stats` table, updated post-matchday

**Complexity:** M

**Dependencies:** `player_match_stats` table, data provider (FB-020 notes), charting library

**Source:** FPL (player stats), Sorare (performance cards)

**Notes:** Use `recharts` or `victory-native` for the sparkline chart — both have React 19 compatibility. The shareable stats card is the organic virality mechanic for this feature. World Cup has at most 7 matchdays per team — form graph will be sparse early; use a "Insufficient data" state for GW1–2.

---

### FB-032
**Title:** AI transfer assistant (rule-based recommendations)

**Priority:** P2

**User Story:** As a player unsure who to transfer, I want the app to suggest transfers with clear reasoning so that I make better decisions faster.

**Acceptance Criteria:**
- Transfer Assistant accessible from Squad screen ("Get suggestions" CTA)
- Recommendations based on rules: FDR (FB-008), form (FB-031), ownership trends (FB-009), price changes, injury status
- Each suggestion includes a plain-language reason ("Haaland has scored in 3 of his last 4 matches and faces a GW5 opponent rated 2/5")
- Maximum 3 suggestions shown per session to avoid overwhelm
- User can accept (jumps to transfer flow with player pre-selected) or dismiss each suggestion

**Complexity:** M

**Dependencies:** FB-008 (FDR), FB-031 (form), FB-009 (ownership), transfer system

**Source:** Original concept, FPL community tools (FPLReview, LiveFPL)

**Notes:** Label as "rule-based AI" not "machine learning" — transparency builds trust. Do NOT use an LLM for real-time suggestions pre-launch (latency, cost, hallucination risk). A simple weighted scoring formula (form × 0.4 + FDR × 0.3 + ownership trend × 0.3) delivers 80% of the value with 10% of the complexity.

---

### FB-033
**Title:** League-level analytics dashboard for commissioners

**Priority:** P2

**User Story:** As a league commissioner, I want to see aggregated stats about my league so that I can understand who is performing well and keep managers engaged.

**Acceptance Criteria:**
- Commissioner-only view in League screen showing: total managers active this GW, average score, highest score, template XI (most owned 11 players in the league)
- Weekly digest email sent to commissioner after each matchday (opt-in)
- Manager participation rate (% who changed team before deadline) shown as a health metric
- "Biggest mover" — manager who gained the most places in the standings this GW
- Data exportable as CSV (for commissioners who want to run side competitions)

**Complexity:** M

**Dependencies:** League system, matchday finalisation, email sending (Supabase + Resend/SendGrid)

**Source:** Original concept, sports analytics dashboards

**Notes:** Commissioners are the power users and evangelists — investing in their experience drives retention of entire leagues. Template XI is particularly shareable on WhatsApp. CSV export is low effort, high goodwill.

---

### FB-034
**Title:** Price change tracking and alerts

**Priority:** P2

**User Story:** As a player monitoring the market, I want to see when a player's price has changed and receive an alert for players in my watchlist so that I can act before prices move further.

**Acceptance Criteria:**
- Price change indicator on player cards (↑ +0.1m green / ↓ -0.1m red) since tournament start
- Watchlist feature: tap a star icon to add a player to your personal watchlist
- Push notification when a watchlisted player's price changes (respects FB-003 prefs)
- Price history chart available in player detail modal
- Prices updated by admin post-matchday; change stored in `player_price_history` table

**Complexity:** S

**Dependencies:** FB-003 (push), player price system, `player_price_history` table

**Source:** FPL (price changes)

**Notes:** Price changes in a WC format are simpler than FPL (no algorithmic transfer-driven prices) — prices can be manually set by admin. The watchlist + notification combo is a powerful re-engagement trigger for inactive users.

---

### FB-035
**Title:** Admin analytics: active users, DAU/WAU, funnel metrics

**Priority:** P1

**User Story:** As the product team, I want a live admin dashboard showing key engagement metrics so that we can make data-driven decisions throughout the tournament.

**Acceptance Criteria:**
- Admin screen includes a Metrics tab (admin-only) showing: DAU, WAU, MAU, new registrations by day, funnel (registered → squad saved → league joined → matchday active)
- Metrics computed from `analytics_events` table (client fires events on key actions)
- Retention cohort chart: % of day-0 registrations still active on day 7, 14, 21
- Top 10 leagues by activity (message count + transfer count)
- Data refreshes every 5 minutes; historical data exportable

**Complexity:** M

**Dependencies:** Analytics event tracking (implement in FB-027 onboarding), Admin screen

**Source:** Internal product requirement

**Notes:** Instrument the app with lightweight event tracking from day 1 — retrofitting is painful. Use a simple `analytics_events` table (user_id, event_name, properties JSONB, created_at) rather than a third-party SDK to keep costs low. PostHog free tier is an alternative if self-hosted analytics proves too slow to build.

---

### FB-036
**Title:** Daily prediction mini-game — result and correct score picks

**Priority:** P2

**User Story:** As a player who wants more to do on match days, I want to predict match results and correct scores so that I have another way to score points and compete with my league.

**Acceptance Criteria:**
- Prediction card on Home screen showing today's matches (up to 4 per day in group stage)
- For each match: predict result (1/X/2) and correct score (optional, higher points reward)
- Points awarded: result correct = 1pt, correct score = 3pts; credited to a separate "Prediction League" table
- Predictions locked at match kick-off; correct score displayed post-match
- Separate prediction leaderboard tab in League screen

**Complexity:** M

**Dependencies:** Top scorer prediction system (partially built), fixture schedule, results data feed

**Source:** Superbru, SofaScore Predictor

**Notes:** The existing `top_scorer_predictions` table and flow (already built) provides the pattern — extend the schema to support result/score predictions. Keep prediction league scoring separate from main fantasy scoring to avoid confusing the core product.

---

## Epic: Onboarding & Growth (continued)

### FB-037
**Title:** Deep-link routing for notifications and invites

**Priority:** P0

**User Story:** As a user who taps a notification or invite link, I want to land on the exact relevant screen so that I am not dumped on the home page and forced to navigate manually.

**Acceptance Criteria:**
- All push notifications carry a `target_url` property that opens the specified screen on tap
- Invite links (`/join?code=XXXX`) pre-fill the join code on the Auth screen
- Gazette share links (`/recap?matchday=5`) open the Recap screen directly
- Deep links work from cold start (app not running) and warm start (app backgrounded)
- Tested across iOS Safari PWA, Android Chrome PWA, and desktop Chrome

**Complexity:** S

**Dependencies:** FB-003 (push), React Router setup, service worker

**Source:** Internal requirement

**Notes:** React Router v6 handles most of this natively. The edge case is cold-start deep linking from push — ensure the service worker's `notificationclick` handler uses `clients.openWindow(target_url)` correctly.

---

### FB-038
**Title:** Responsive mobile-first layout polish and PWA install prompt

**Priority:** P0

**User Story:** As a mobile user, I want the app to feel native on my phone with smooth navigation so that I recommend it to friends rather than abandoning it for a native app.

**Acceptance Criteria:**
- All 9 screens render correctly on iPhone SE (375px), iPhone 14 (390px), and Samsung Galaxy S22 (360px)
- No horizontal scroll on any screen at any viewport
- PWA install prompt ("Add to Home Screen") appears after user's 3rd session or on manual trigger
- App has a custom splash screen, icon, and standalone display mode configured in `manifest.json`
- Lighthouse PWA score > 90 (Performance, Accessibility, Best Practices)

**Complexity:** M

**Dependencies:** All screens built (already the case)

**Source:** Internal quality requirement

**Notes:** The pitch view on Squad screen is the most complex responsive layout. Test on real devices, not just browser DevTools. PWA install prompt cannot be forced on iOS — implement a custom "Add to Home Screen" guide modal for Safari users.

---

### FB-039
**Title:** Email verification and password reset flow

**Priority:** P0

**User Story:** As a new user, I want to verify my email and reset my password if forgotten so that my account is secure and recoverable.

**Acceptance Criteria:**
- Supabase email verification sent on signup; unverified users shown a banner prompting verification
- Verified status checked on login; unverified users can still use the app but cannot join leagues
- Password reset email sent via Supabase Auth with branded template
- "Forgot password" link on login screen triggers reset flow
- Email templates use ForzaKit branding (logo, colours, footer links)

**Complexity:** S

**Dependencies:** Supabase Auth configuration

**Source:** Standard auth requirement

**Notes:** Customise Supabase email templates in the Dashboard (Settings → Auth → Email Templates). Use a custom SMTP sender (e.g. Resend) for deliverability — Supabase's default sender has poor inbox placement.

---

### FB-040
**Title:** Username selection and public profile setup

**Priority:** P0

**User Story:** As a new user, I want to choose a unique username so that league mates can identify me in standings, chat, and the Gazette.

**Acceptance Criteria:**
- Username prompted during onboarding (step 1 of FB-027 flow)
- Usernames 3–20 characters, alphanumeric + underscores only, unique constraint enforced by DB
- Username availability checked in real-time with 300ms debounce
- Users can change their username once per month (stored in `profiles.username_changed_at`)
- Username displayed throughout the app: standings, chat, Gazette cards, invite cards

**Complexity:** S

**Dependencies:** `profiles` table, auth system

**Source:** Sleeper, Reddit (username pattern)

**Notes:** Already partially implemented based on codebase state. Confirm the unique index exists on `profiles.username`. Pre-generate 10 username suggestions based on the user's email prefix to reduce drop-off at this step.

---

## Summary: Launch Readiness Checklist

| Priority | Count | Target Completion |
|----------|-------|-------------------|
| P0 (Pre-launch blockers) | 11 items | May 31, 2026 |
| P1 (Launch window) | 14 items | June 14, 2026 (GW1) |
| P2 (Post-launch, group stage) | 12 items | June 28, 2026 (R16) |
| P3 (Future / v2) | 1 item | Post-tournament |

### P0 Items (must ship before June 2026 launch)
FB-001 · FB-002 · FB-003 · FB-004 · FB-005 · FB-006 · FB-007 · FB-016 · FB-027 · FB-037 · FB-038 · FB-039 · FB-040

### Critical Path Dependencies
```
Auth + RLS (FB-004, FB-039, FB-040)
  └── Squad / Transfer system (existing)
        └── Deadline lock (FB-002)
              └── Transfer countdown UX (FB-010)
Supabase Realtime (FB-001)
  └── Live scoring (FB-016)
        └── H2H live view (FB-017)
Push infrastructure (FB-003)
  └── Deadline notifications (FB-010)
  └── Daily notification loop (FB-030)
  └── Price alerts (FB-034)
League chat (FB-021)
  └── Auto-transaction cards (FB-022)
```

### Known Risks
1. **Live data feed** — FB-016, FB-020, FB-031 all depend on a real-time sports data provider. Evaluate and contract a provider (Sportmonks / API-Football) by May 1, 2026.
2. **iOS push notifications** — Web push on iOS requires iOS 16.4+ and the app added to Home Screen. Communicate this limitation clearly in onboarding.
3. **Supabase Realtime scale** — Free/Pro tier has concurrent connection limits. Load test at 100 concurrent users on match day before launch.
4. **Server-side card rendering** — Gazette and Stats cards using html2canvas are fragile. Migrate to `@vercel/og` edge function before launch (FB-019 notes).

---

*Backlog maintained by: Product / Engineering | Next review: Sprint planning, week of May 4, 2026*
