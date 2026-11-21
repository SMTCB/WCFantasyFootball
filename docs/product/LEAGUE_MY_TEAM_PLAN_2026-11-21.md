# Football league "My team": implementation plan (Option C)

How to fold the Squad and Market pages into the football league. The owner approved Option C on 2026-11-21. Once it ships, a league has one screen. Your team, the table, recap, bets and stats are tabs on it. Transfers happen from the pitch, without leaving the league.

- **Proposal with mocks (phone and desktop):** https://claude.ai/artifact/QKqMdGT8y2RFiaPfZEF6tZ (source: [league-squad-one-view.html](../design/proposals/league-squad-one-view.html))
- **Backlog:** rows MD-11, MD-12 and MD-13 in [BACKLOG.md](../../BACKLOG.md), grouped as sessions S30 to S32 under "Wave 3b"
- **Builds on:** [CLUBHOUSE_MATCHDAY_SCREENS_PLAN_2026-11-20.md](CLUBHOUSE_MATCHDAY_SCREENS_PLAN_2026-11-20.md) (S26 to S29, the Matchweek tab)

---

## 0. The design lock (the owner's critical rule)

> "The pitch view (the field, icons, club crest, etc) should stay EXACTLY as they are today. We are changing the places, the logic, etc., but the pitch design, the player icon design and also what appear when I click on a player should keep the current design." (owner, 2026-11-21)

**Locked: these must look the same before and after every session**

| What | Code today | Rule |
|---|---|---|
| The pitch: grass, lines, layout, phone and desktop | `src/components/MobilePitchField.jsx`, `src/components/PitchView.jsx`, `src/lib/pitchLayout.js` | No style, size, color, spacing or layout edits. |
| The player token: shirt, crest, name, price or points, captain mark, status color | Inside the two pitch components, using `STATUS_COLOR` from `pitchLayout.js` | Same. The status color on the shirt is already there and is what "status" uses. |
| Club crests | `src/components/ClubCrest.jsx` | No edits. Pass it as a prop to `MobilePitchField`, as today, because of the TDZ rule. |
| The benches | The bench rows and bench strip used by Squad and Matchweek | Same look. |
| What opens when you tap a player | The player action sheet now inline in `SquadScreen.jsx` (about lines 1955 to 2125): header, stats, Make captain, Sub in or out, Add to pitch, Sell, "View full stats dashboard" | Move it unchanged into its own file (`src/components/squad/PlayerActionSheet.jsx`). Same markup and same styles, as a cut and paste. |

**What is allowed: added features, in the existing style**

- **New buttons in the player sheet**, like "Replace", built with the sheet's existing button style and placed after its current buttons. Nothing existing is moved or restyled.
- **New items around the pitch**, never on it: the needs-attention line, the chips row, the "Review changes" bar, the Pitch / List switch.
- **The state of a pending change.** If a token must show that a swap is waiting, the pitch components get an optional new prop. When the prop is not passed, the output is byte-for-byte what it is today. No existing prop changes meaning.

**How each session proves it**

1. Take before-and-after screenshots of the pitch and the player sheet at 375px and 1280px with the same squad. They must match. The only allowed difference is a new button or a new element outside the pitch.
2. Run `git diff` on `MobilePitchField.jsx`, `PitchView.jsx`, `pitchLayout.js` and `ClubCrest.jsx`. It must be empty, or new optional props only.
3. The PR description names the lock and links the screenshots.

---

## 1. Rules for every session

1. **The design lock above comes first.**
2. **Light mode only. Use the four words only:** Clubhouse, League, Bets, Coins. Money is in €.
3. **No database changes.** Buying, selling, lineup, captain and chips keep calling the RPCs they call today: `useTransfer` (buy, sell), `set_lineup`, `set_captain`, and the chip functions in `src/lib/chips.js`. No migration and no Edge Function deploy is planned. If a session finds it needs one, it stops and asks first (CLAUDE.md).
4. **Rolldown TDZ rule** (CLAUDE.md). `SquadScreen` and `MarketScreen` import `LeagueRouteTabs` from `HubShared`, which `LeagueScreen` also imports.
   - Inside the league, load the team and market views with `lazy()`, or move the shared pieces out so each module is imported at only one depth.
   - Before adding an import to a child of `LeagueScreen`, grep `LeagueScreen.jsx` for it.
   - Run `npm run build` every session. The crash shows only in the production build.
5. **Nothing is removed until its replacement is live.** `/squad` and `/market` keep working as redirects to the league's tabs (`/league?leagueId=…&tab=team`, with the market sheet open for `/market`). They stay as redirects; they are not deleted.
6. **Phone first.** Check 375px every session. The desktop layout comes in S32.
7. **Tests:** `platform.spec.js` must stay green. The "my squad" (lines 186 to 242) and "player market" (lines 268 to 433) tests visit `/squad` and `/market`. Point them at the new tab as each page moves, and keep the `data-tour` markers (for example `market-filters`) so the tour and tests still find them.

---

## 2. Where things go

| Today | After Option C |
|---|---|
| League tabs: Matchweek, Squad, Market, Recap, Bets, (Trading), Stats | **My team**, **Table**, Recap, Bets, (Trading for draft leagues), Stats |
| Matchweek tab (S28): race card, live pitch, table, fixtures | Split. The race card, live pitch and fixtures go to **My team**. The table goes to **Table**. |
| `/squad` page: pitch, bench, captain, chips, status | The **My team** tab. Same pitch, same bench, same sheet. |
| `/market` page: filters, list, basket, auto-fill | A **market sheet** opened from My team: a tall sheet on phone, a right panel on desktop. Same filters, same list, same buy logic. |
| Sell a player, then go to Market and buy one | Tap a player, then **Replace**. Pick from affordable players in the same position, or "Browse full market". |
| Changes save one at a time | Changes wait on the pitch. A "Review changes" bar leads to one **Confirm transfers**. |
| Chips panel on Squad | Chips row under the pitch on phone, a chips card in the right column on desktop. Same chips: Triple Captain ×3, Joker ×2, Max Cap (automatic). Hidden when the commissioner turns chips off. |
| Status list on Squad | One "needs attention" line above the pitch ("2 need attention: 1 injured, 1 doubtful"), opening the same list. Shirts keep their status color. |
| — | A **Pitch / List** switch: the same squad as a compact list. |

---

## 3. Build order and sessions

### S30: "My team" and "Table" tabs (row MD-11)

**Goal:** the league opens on My team. It shows your pitch and lets you manage the lineup without leaving the league.

**Steps**
1. Before you change anything, take screenshots of the Squad pitch, the bench and the player sheet at 375px and 1280px.
2. Move the player sheet out of `SquadScreen.jsx` into `src/components/squad/PlayerActionSheet.jsx`, unchanged. Squad must look the same after the move. This is its own commit.
3. Give `SquadScreen` an `embedded` mode. It hides its own header, `LeagueRouteTabs` and the page chrome, and draws the pitch, bench, captain and sheet only.
4. In `HubShared.jsx`, change `hubTabList` to My team, Table, Recap, Bets, (Trading), Stats. Move Matchweek's race card, live pitch and fixtures into My team, and its live table into Table. Keep `?tab=matchweek` working as a redirect to My team.
5. Add the chips row under the pitch (phone), reusing `ChipsPanel` logic.
6. Add the needs-attention line (reusing `DangerList`) and the Pitch / List switch.
7. Redirect `/squad` to `/league?leagueId=…&tab=team`. Update every link:
   - `MatchweekView.jsx` "Edit in Squad →" (line 373)
   - `LeagueScreen.jsx` `goSquad` (line 1407)
   - `AppLayout.jsx` (lines 105 to 128)
   - `CompetitionNav.jsx` (line 317)
   - `useActiveCompetition.js` (line 23)

**Test:** the design-lock checks in section 0; set the lineup, captain and a chip from the new tab; the "my squad" tests point at the tab; `npm run build`; `platform.spec.js`.

### S31: Replace, the market sheet and one confirm (row MD-12) (done 2026-11-21)

**Done.** Screenshots: [s31-design-lock/](../design/s31-design-lock/). Notes: the pending basket lives in `SquadScreen` (`src/lib/transferBasket.js`), the market sheet is `src/components/squad/MarketPanel.jsx` (it loads `MarketScreen` with `embedded`), and the review bar is `src/components/squad/TransferReviewBar.jsx`. On desktop the market already opens as a right panel; S32 does the rest of the desktop layout.

**Goal:** you swap players from the pitch and confirm all your changes at once.

**Steps**
1. Add a "Replace" button to `PlayerActionSheet`, shown only while the transfer window is open (`useTransferWindow`). Use the sheet's existing button style, placed after the current buttons.
2. "Replace" opens the replacements sheet. Reuse `PlayerPickerSheet` (affordable players in the same position, sorted by form) and add a "Browse full market" link.
3. Give `MarketScreen` an `embedded` mode and show it in a sheet (`BottomSheet`, tall) on phone and a right panel on desktop. Keep its filters, list and `useAutoFill`.
4. Keep changes pending. Reuse `MarketScreen`'s `basket` state to hold sells and buys. The pitch shows the incoming player through the optional new prop from section 0. A "Review changes" bar shows the count and the money left.
5. "Confirm transfers" runs the pending sells and buys through `useTransfer` in order, then refetches. If one fails, it stops and shows which one; the rest stay pending.
6. Show the Joker chip (a 16th player for one matchday) as its own button in the chips row. It opens the existing Joker picker.
7. Redirect `/market` to My team with the market sheet open. Update the Squad "Market" buttons (`SquadScreen.jsx` lines 969, 973, 1434, 1449, 1818, 1831), the Market link in `LeagueScreen` (line 1422) and the `M` shortcut in `useKeyboardShortcuts.js` (line 45).

**Test:** the design-lock checks; replace one player and then three, with confirm; over-budget and full-club cases are blocked as today; a closed window hides "Replace"; the "player market" tests point at the sheet; `npm run build`; `platform.spec.js`.

### S32: Desktop, draft leagues, clean-up (row MD-13) (done 2026-11-21)

**Done.** Screenshots: [s32-design-lock/](../design/s32-design-lock/). Notes: the desktop side column is in `SquadScreen` (`my-team-side`); the round's matches come from `MatchweekView` through SquadScreen's `sideExtra` prop; `ChipsRow` has a `stacked` card form. Replace is hidden in a draft league (`format = 'noduplicate'`) while the transfer window type starts with `wishlist`. The tour on My team now points at the pitch, budget, chips and the league tabs; the old Squad and Market tours, page headers, league tab rows, transfer banner, action bar and the market's own basket bar are gone.

**Goal:** the desktop layout from the mocks, draft leagues covered, and the old pages gone.

**Steps**
1. Build the desktop layout. The pitch spans the left column at the same size as today. The right column holds Needs attention, Chips and This round's matches. The market opens as a right panel.
2. Draft leagues: My team works the same, Trading stays its own tab, and "Replace" is hidden where draft rules do not allow free buys.
3. Remove `SquadScreen` and `MarketScreen`'s standalone page chrome. Keep the two routes as redirects.
4. Update the onboarding tour steps that point at Squad and Market (`SquadScreen.jsx` around lines 514 to 529).
5. Run the full test pass. Update `DOCS_MAP.md` if files moved.

**Test:** the design-lock checks at 1280px and 1440px; a draft league and a non-draft league; `npx madge --circular src/`; `npm run build`; `platform.spec.js` on both browsers.

---

## 4. Database changes at a glance

None. All three sessions reuse today's RPCs and functions. Any surprise need for a migration stops the session and goes to the owner first.

## 5. Risks

- **TDZ crash.** Embedding Squad and Market inside LeagueScreen puts `HubShared` at two depths. Lazy loading and the build check (rule 4) cover it.
- **Drift from the locked design.** Moving the sheet is a cut and paste, not a rewrite. The before-and-after screenshots catch drift.
- **Pending changes lost.** If you leave the tab with changes waiting, warn first. The changes are not saved until you confirm.
- **Two places to buy during the move.** Between S30 and S31, `/market` still works as today, so nothing is ever unreachable.

Last Updated: 2026-11-21
