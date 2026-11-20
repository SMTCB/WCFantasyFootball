# Clubhouse "Matchday" screens: implementation plan

How to build the four screens of Direction A, "Matchday", that the owner approved on 2026-11-20. The screens are Home, inside a clubhouse, the football league's new Matchweek tab, and Bets.

- **Design board** (desktop and phone for every screen): https://claude.ai/artifact/PuRe51KFXyT2y6NVEoN68f (Version 4)
- **Backlog:** rows MD-1 to MD-9 in [BACKLOG.md](../../BACKLOG.md), grouped as sessions S26 to S29 under "Wave 3b"
- **Earlier decisions:** [CLUBHOUSE_BRAND_AND_SCREENS_2026-11-13.html](CLUBHOUSE_BRAND_AND_SCREENS_2026-11-13.html)

---

## 1. Rules for every session

1. **The pitch does not change.**
   - The Matchweek tab reuses `src/components/PitchView.jsx` (desktop) and `src/components/MobilePitchField.jsx` (phone) exactly as the Squad screen draws them today. That includes the benches: the desktop bench strip and the phone "Substitutes" rows from `SquadScreen.jsx`.
   - No edits to these two components or to `src/lib/pitchLayout.js`.
   - Live points reach the pitch the way points do today. The tab passes a `squad` whose `players[].points` hold the live number, and both components already read `player.points`.
   - On desktop the pitch spans the full content width, as on the Squad screen. Below that width the full tokens overlap and the component switches to its compact pills.
   - The bench rows now live inline in `SquadScreen.jsx`. Move them unchanged into `src/components/squad/BenchStrip.jsx` and `BenchRows.jsx`, so Squad and Matchweek render the same code. Squad must look identical before and after the move.
2. **Light mode only.** No felt, chips, pot or anything else that looks like gambling. Gold means "this is about you".
3. **Use the four words only:** Clubhouse, League, Bets, Coins.
4. **Realtime channels.** A hook that opens a channel puts a per-mount random suffix in the name (see CLAUDE.md, PR #1169). Presence is the one exception: everyone must join the same channel name, so it lives in one provider per clubhouse and no other component opens it (MD-5).
5. **Rolldown TDZ rule** (CLAUDE.md). The Matchweek tab sits inside `LeagueScreen`.
   - Before importing `PitchView`, `MobilePitchField`, `HubShared` or `ClubCrest` in a child, grep `LeagueScreen.jsx` for the same import.
   - `ClubCrest` is already passed to `MobilePitchField` as a prop for this reason. Keep doing that.
   - Run `npm run build` every session.
6. **Motion.** Points that tick up, the floating "+N" and the table that reorders all switch off under `prefers-reduced-motion`. Use the existing `NumberFlow` component for counting.
7. **Nothing is removed until its replacement is live.**
   - Old routes (`/live`, `?tab=leaderboard`) keep working, as redirects to the new place.
   - League-level bets keep their screens until the end of the season (owner decision 2026-11-13, C-20).
8. **Database changes.** Each session lists them. Every migration needs the owner's explicit yes for that item, plus a backup first (CLAUDE.md Pilot Safeguards). The next free migration number is **313**.

---

## 2. What exists today

| Board screen | Today's code | Reuse | New |
|---|---|---|---|
| **01 Home** (all clubhouses) | `HomeDashboardScreen.jsx` (460 lines): clubhouse cards with league chips, `YourMoveList`, find or create panel | `useYourMove()` already reads every clubhouse; `useClubhouseContext`; the find or create panel | Headline ("You lead N of your M leagues" plus the closest race), the live hero, the score ticker, clubhouse labels on Your move cards, the "Where you stand" rail |
| **02 Inside a clubhouse** | `ClubhouseScreen.jsx` (1,060 lines): tabs Room, Leagues, People, Settings, The Paper; `ClubhouseChat` (the Room); `YourMoveLine` | The Room as built in S11 to S15 (stream, bet cards, reactions, join and Paper cards); `useClubhouse`; `get_circle_meta_standings` | The members display (C-shaped table, faces in seats, glow for who is here now, Room bubbles, member count), Leagues as the default tab, league cards with your rank and gap |
| **03 Football league, Matchweek tab** | Standings live in `LeagueScreen.jsx` (`view === 'detail'`, `LeagueDetailView`). Live is a separate route, `LiveScreen.jsx` (1,470 lines), with its own `MiniPitch`. Tabs come from `hubTabList` in `HubShared.jsx` | Live points logic in `LiveScreen` (`player_match_stats` plus a realtime channel, 60 s refresh); `PitchView` and `MobilePitchField`; `get_h2h_standings` | One Matchweek tab merging Live and Standings: Your race card (H2H duel as a variant), the live pitch, the table "as it stands" that reorders, fixtures, one Room line |
| **04 Bets** | `MyBetsScreen.jsx` (173 lines, sections); `ChallengeScreen.jsx` (2,904 lines: create, take, declare, wallet tab); `BetThread.jsx` (per-bet chat, migration 311) | `useMyBets`, `useGroupBets`, `useChallenges`, `useWallet`; the bet thread; the create-bet modal logic | The one-sentence composer at the top, sections Waiting on you, Live now, Awaiting result and Settled, league bets listed apart, the coins card, live score inside a thread |

**Data gaps found while mapping:**

- **Here-now presence:** not built anywhere (no Realtime Presence in `src/`).
- **Rank and gap per league, across clubhouses:**
  - Football: `league_members` already has `rank` and `total_points`. The gap to the people above and below means reading the neighbours' rows. That is a client query if the table's access rules allow it, otherwise one read-only function.
  - F1 and tennis: their standings come from their own tables.
- **Live points outside the Live screen:** the logic lives inside `LiveScreen.jsx`. It is not a hook, so Home and the Matchweek tab cannot reuse it yet. Its realtime channel name (`live-player-stats-…`) has no random suffix, so moving it into a shared hook must add one.
- **The table as it stands:** needs live points for every member, not just you. Doing it in the browser means loading every member's eleven players and their match stats. One read-only database function that sums them is cheaper and keeps the numbers the same for everyone.
- **Live score in a bet thread:**
  - Squad-total bets (`gw_total`) already carry `league_id` and `matchday_id`, so the thread can show both squads' live totals.
  - Freeform bets have no link to a match. Linking a match would need a new column. That is a decision for the owner, not assumed here.

---

## 3. Build order and sessions

Build in the board's order: Home first, so every user sees the new look on day one; then the clubhouse; then Matchweek; then Bets. Each session is one pull request. MD-3 (live points as a hook) is built in S26 and reused in S28.

### S26: Home, "Matchday" (rows MD-1, MD-2, MD-3)

**MD-3: live points as a shared hook (do first)**
- Move the live points logic out of `LiveScreen.jsx` into `src/hooks/useLivePoints.js`. It returns per-player live points, a squad total and a "match on" flag, and gives its channel a random suffix.
- `LiveScreen` then uses the hook and must show the same numbers as before (compare on a live matchday or against a finished one).

**MD-2: where you stand, every league**
- New hook `useMyLeaguePositions()`. For each active league in each clubhouse it returns: clubhouse, league, sport, your rank, your total, and the person above and below with their totals.
- Football reads `league_members`. F1 and tennis use the standings their screens already read.
- If the access rules stop a member reading their neighbours, add one read-only function, `get_my_league_positions()` (migration 313, **needs your yes**).

**MD-1: the new Home**
- Headline "You lead N of your M leagues", with a sub-line naming the closest race and its clubhouse.
- A live hero when one of your matches is on (from MD-3), otherwise the next deadline.
- A score ticker of live fixtures in your tournaments.
- Your move cards, each labelled with its clubhouse (`useYourMove` items already carry `circleId`).
- The "Where you stand" rail, one row per league (MD-2).
- The clubhouse cards and the find or create panel stay.
- Phone and desktop per the board.

**Test**
- One account in 1 clubhouse and one in 3 or more: the headline counts are right and every card names its clubhouse.
- No live match: no hero and no empty ticker.
- 375 px width.
- `platform.spec.js` (Home assertions will change).

### S27: Inside a clubhouse (rows MD-4, MD-5)

**MD-5: here now**
- Supabase Realtime Presence on one channel per clubhouse (`clubhouse-presence:<id>`).
- It is opened once by a provider around `ClubhouseScreen`, which tracks the user id while the screen is open.
- No database change.

**MD-4: clubhouse header and Leagues tab**
- The members display above the tabs: C-shaped table, faces in seats, a glow for who is here now (MD-5), the latest Room messages as bubbles, the member count in the middle, and no bets on the table.
- Tab order Room, Leagues (the default), People. Settings and The Paper stay where they are.
- League cards show your rank, your total and the gap, from MD-2.
- The Room itself is unchanged.

**Test**
- Two signed-in browsers in the same clubhouse: each sees the other glow, and the glow goes when one leaves.
- A clubhouse with 2 members and one with 12: seats lay out without overlap.
- The Room still sends, reacts and opens a bet.

### S28: Football league, Matchweek tab (rows MD-6, MD-7)

**MD-7: the table as it stands**
- One read-only function, `get_live_league_table(p_league_id, p_matchday_id)` (migration 313 or 314, **needs your yes**). It returns each member's season total, plus live matchweek points so far and the live rank.
- The tab subscribes to `player_match_stats` through MD-3 and refetches on change, with a short delay so a burst of updates causes one refetch.

**MD-6: the Matchweek tab**
- A new tab in `hubTabList`, called Matchweek, placed first. It replaces the Live and Standings entries; both old addresses redirect to it.
- **Your race card:** the people just above and below you on season totals, and the gap. In H2H leagues the head-to-head duel card shows instead (`get_h2h_standings`).
- **Your team:** `PitchView` on desktop, full content width, with the bench strip; `MobilePitchField` on phone, with the Substitutes rows. Both are unchanged, with live points passed in through `players[].points` (rule 1).
- **The table as it stands** (MD-7): rows reorder when ranks change. The full season standings, recap and stats stay one tap away.
- This week's fixtures, with live scores.
- One Room line for the clubhouse the league belongs to.

**Test**
- A finished matchweek: points and table match today's Standings and Live screens exactly.
- A live matchweek: points tick and rows reorder.
- An H2H league shows the duel card.
- Desktop pitch tokens do not overlap at 1280 px; phone pitch at 375 px.
- Squad screen unchanged (screenshot before and after).
- Old `/live?leagueId=` links land on the tab.
- `npm run build` clean (TDZ).

### S29: Bets (rows MD-8, MD-9)

**MD-8: the Bets screen**
- At the top, the one-sentence composer ("I bet ___ that ___"). It reuses the create logic from `ChallengeScreen`'s create-bet modal, which moves into a shared component.
- Sections Waiting on you, Live now, Awaiting result and Settled, from `useMyBets` and `useGroupBets`.
- The league bets list sits apart and is unchanged (C-20).
- The coins card comes from `useWallet`.
- Each bet opens as its own conversation (`BetThread`).
- `ChallengeScreen` keeps its routes until the new screen is confirmed. It then becomes a redirect (a later row, not this session).

**MD-9: live score in a bet's thread**
- For squad-total bets (`gw_total`), show both squads' live totals at the top of the thread, from MD-3.
- Freeform bets show no score.
- Linking a freeform bet to a real match needs a new column. Ask the owner before building it.

**Test**
- Create, take, pass and declare a bet from the new screen.
- A squad-total bet shows live totals in its thread.
- League bets still open and settle as before.
- 375 px width.

---

## 4. Database changes at a glance

| Row | Change | Type | Needs your yes |
|---|---|---|---|
| MD-2 | `get_my_league_positions()`: only if the access rules block the neighbours query | Read-only function | Yes |
| MD-7 | `get_live_league_table(league, matchday)` | Read-only function | Yes |
| MD-9 (optional) | A match link on freeform bets | New column | Yes, and a design decision first |

No Edge Function deploys and no jobs. Presence needs no database change.

---

## 5. Risks

- **The Matchweek tab touches `LeagueScreen`,** the largest screen and the source of all three past TDZ crashes. Keep the tab in its own component file, pass shared pieces down as props, and check the production build.
- **Live load:** many members open Matchweek at kick-off. The table function must read from indexed columns, and the tab must refetch at most once every few seconds.
- **The old Live screen and the new tab must agree.** After MD-3 they share one hook, and S28's first test compares them.
- **Presence counts people with the screen open, not people "online".** The glow says "here now" and nothing stronger.

Last Updated: 2026-11-20
