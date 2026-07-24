# Coin Challenges — Design Handoff Brief

**For: Claude Design · Prepared July 2026 · Kit Light direction**

**One-line summary:** Extend the existing Coin Challenges screen to work at Clubhouse scope instead of a single football league — a real member picker, a Competitor-vs-Freeform bet-type choice, and a new declare/confirm/dispute flow for freeform prop bets.

---

## What This Is

Coin Challenges are peer-to-peer, coin-staked bets between two Clubhouse members. Today the screen exists and is already built in Kit Light tokens, but its underlying data model only supports one bet: "who scores more fantasy football points this gameweek," between two people in the same football league. The product decision (2026-07-24): move this to **Clubhouse scope** — any member can challenge any other member, competitions aside — and add a second bet type, **freeform prop bets**, that aren't tied to any competition at all ("will it rain at kickoff," "who buys the next round"). Full rationale and data model: [P2P_BETTING_CLUBHOUSE_SCOPE_TECH_SPEC.md](../../../architecture/P2P_BETTING_CLUBHOUSE_SCOPE_TECH_SPEC.md) (Claude Code's companion doc to this one).

This is **not a from-zero redesign**. The existing screen (`src/screens/ChallengeScreen.jsx`) is already Kit-Light-token-compliant — cards, coin icon, incoming/sent/live/settled sections, a wallet sidebar — and reads as a reasonably crafted screen already. The design work here is: (1) fix a genuinely broken opponent-picker UX, (2) add the Competitor/Freeform choice to the create flow, and (3) design a net-new interaction pattern — propose → confirm/dispute → owner arbitrates — that doesn't exist anywhere else in the product yet.

**Live reference app:** https://wc-fantasy-football.vercel.app — the current screen lives at `/challenges` (reachable from the sidebar's "Coin Challenges" item, tagged Beta). Note: creating a challenge from this screen **currently fails every time** — it's mid-migration, not a bug you're missing; see the tech spec's "Current State" section for why.

---

## Read First — Reconciled Design Tokens

Same token set as every other Kit Light brief in this repo. Full reconciled table lives in [clubhouse_core/README.md § Read First](../clubhouse_core/README.md#read-first--reconciled-design-tokens) — don't duplicate-maintain it here, reference it. The tokens this screen leans on most:

| Token | Hex | Usage on this screen |
|---|---|---|
| `--gold` | `#B8720E` | The existing "money" color — coin icon, stake amounts, primary CTA ("New Challenge"). Keep this as the Competitor-bet identity. |
| `--accent` | `#1A6FA8` | Sent/outgoing card border, tab underline elsewhere in the app. |
| `--positive` / `--danger` | `#166534` / `#B91C1C` | Win/loss amounts, leading/behind states on the live score card. |
| `--mute` | `#8A97A8` | Eyebrows, metadata, muted labels — this screen already uses these heavily via inline JetBrains Mono labels. |

**New decision needed in this brief:** Freeform bets need their own visual identity, distinct from `--gold` (which the existing screen has fully claimed for "GW Total" competitor bets — stake amounts, the CTA button, the incoming-card border). Don't invent a seventh accent color from nothing; `--accent` (blue) is already unused on this screen and reads as "the other kind of thing" without competing with gold. Proposal, not mandate — Claude Design should make the final call.

Type system: unchanged — Archivo Black for headline numbers (stakes, scores), Archivo for body, JetBrains Mono for eyebrows/labels/metadata, used sparingly.

---

## Priority 1 — Fix the Create Challenge Flow

### The actual design problem to solve

The current "New Challenge" bottom sheet asks the user to **paste another user's raw UUID** into a text field (`ChallengeScreen.jsx:499-506`) — there's no picker, no search, no avatar, nothing. This was never designed; it was a placeholder that shipped. Combined with the Clubhouse-scoping work, this is the moment to fix it properly: the create flow now has a real, bounded list of eligible opponents (everyone in the active Clubhouse) to build a picker from.

### What the new flow needs to support

1. **Opponent picker** — replace the text input with a searchable member list (avatar + name), sourced from the active Clubhouse's roster. This is the same data the Clubhouse "Members" tab already renders — reuse that visual pattern rather than inventing a new member-row component.
2. **Bet type choice** — a two-option toggle or segmented control, shown before anything else in the sheet:
   - **Competitor** — "Bet on a real result." Requires picking which competition (a football league / F1 paddock / tennis box — whichever ones exist in this Clubhouse) and, for football, which gameweek. This is functionally today's flow, just re-scoped.
   - **Freeform** — "Bet on anything." No competition picker at all. Replaces the matchday field with a required short **Question** field (what's being decided) — the existing optional "Message" field stays underneath as flavor/trash-talk text, separate from the question itself.
3. **Stake picker, message field, submit button** — unchanged from today; these already work well (preset chips at 50/100/250/500 coins + custom input, live "net win after 5% rake" calculation).

### States to design

- Empty roster (a brand-new Clubhouse with only the creator as a member) — creating any challenge is impossible; the sheet needs a clear "invite someone first" state rather than an empty picker.
- Competitor bet type selected but the Clubhouse has zero competitions yet — same problem, different cause; needs its own empty state pointing at "add a competition."
- Freeform question field at its 140-char limit (same treatment as the existing message field's live character countdown).
- Error states already exist and read well (`DAILY_STAKE_CAP_EXCEEDED`, `DUPLICATE_CHALLENGE`, `INSUFFICIENT_BALANCE` all have friendly copy today) — freeform needs no new error states beyond insufficient balance, since it has no competition/duplicate constraints.

---

## Priority 2 — The Declare / Confirm / Dispute Flow (net new)

This is the one genuinely new interaction pattern in this brief, and it deserves the same attention the Clubhouse gazette's reactions/comments got in the Clubhouse Core brief — it's unusual enough in this product that there's no existing pattern to copy.

### The lifecycle

A freeform challenge, once accepted, has no auto-resolution — nothing in the platform's data knows whether "it rained at kickoff" is true. Instead:

1. **Live** — both stakes are in escrow, same `LiveCard` treatment as today's GW Total live bets, but showing the **question** instead of a live score comparison (there's no score to show for a freeform bet).
2. **Either party proposes a result** — a "Declare result" action appears on the live card. Proposing means picking a winner (themselves, the opponent, or "push / no winner" for a void).
3. **The other party responds** — **Confirm** (pays out immediately, same 95%/5%-rake split as today) or **Dispute** (freezes the challenge, stakes stay in escrow, routes to the Clubhouse owner).
4. **Owner arbitrates a dispute** — the Clubhouse owner sees a pending arbitration (likely via Inbox, matching the existing notification pattern) with the two parties' claim and a single "who won" decision that settles it unilaterally.

### Design questions this needs to answer

- What does a card look like **mid-declaration** — i.e. after party A proposes but before party B responds? It's a third visual state beyond "live" and "settled" that doesn't exist today. Needs to clearly show *what was proposed* and *whose turn it is to act*.
- Does "Declare result" need a confirmation step of its own (you're about to claim a coin outcome — accidental taps here have real stakes)?
- Where does the disputed state surface for the non-owner parties while they wait? A "pending arbitration" label on the card, presumably — needs a distinct look from both "live" and "settled."
- Owner arbitration UI: a dedicated screen, an Inbox card with two buttons, or a modal? This wasn't scoped further in the tech spec — Claude Design's call, but it needs to show both parties' side (challenger vs opponent, their proposed outcomes if they disagreed) before the owner decides.

---

## Priority 3 — Update the Settled/History Display

`HistoryItem` (today: `ChallengeScreen.jsx:248-287`) shows "GW Total Battle · 62—58 pts" as its subtitle. For freeform-resolved bets there's no score line — it should show the **question** text instead, plus (if it went through arbitration rather than mutual confirmation) a small "· resolved by [owner]" note, so a Clubhouse member skimming their history can tell the difference between "we agreed" and "the owner had to step in."

Add a type badge to distinguish Competitor vs Freeform history rows at a glance — same visual language as the existing `GW{n} · GW Total` pill on live/incoming cards (`ChallengeScreen.jsx:81-87`), just with the freeform accent color from the Read First section.

---

## Priority 4 — Entry Point / Routing

Today `/challenges` is a **global** route with no Clubhouse context — it's what causes the "always fails to create" bug (see [What This Is](#what-this-is)). Once Clubhouse-scoping ships, this screen needs to behave like every other Clubhouse-scoped surface: it switches when the user switches Clubhouses via the sidebar/multi-Clubhouse-switcher work described in [clubhouse_core/README.md](../clubhouse_core/README.md#multi-clubhouse-switching). No new screen needed for this — just confirm the header ("Coin Challenges") and any breadcrumb/back affordance make clear *which* Clubhouse's challenges the user is looking at, especially for users in more than one Clubhouse.

---

## Desktop Requirements

- Target ≥1024px. The screen already uses a two-column layout (main challenge list + a 256px right sidebar with wallet mini-card, season record, "how it works" card) — keep that structure; the changes here are additive (bet-type badges, a member picker, new card states), not a layout rework.

## Mobile Requirements

- Target <768px, primary breakpoint 390px. The existing mobile pattern (sidebar content folds above the challenge list, `PrimaryActionBar` pins "New Challenge" to the bottom) already works — the create-challenge sheet is already a bottom drawer via `createPortal`, which is the right pattern to extend for the bet-type toggle and member picker, not replace.
- The member picker in particular needs to work at 390px — a searchable list with avatars in a sheet that's already competing for vertical space with a bet-type toggle, competition picker, and stake picker. Consider whether bet-type selection should be its own step (progressive disclosure) rather than everything on one scrolling sheet, especially on mobile.

---

## What to Send Back

- Updated Create Challenge flow: bet-type toggle, member picker (replacing the raw ID input), competition/matchday picker for Competitor bets, question field for Freeform bets — desktop and mobile (390px).
- The three new freeform lifecycle states: mid-declaration ("your move"), disputed/pending-arbitration, and owner-arbitration UI.
- Updated `HistoryItem` and live-card treatments showing the Freeform badge + question text.
- A clear color/badge decision for Competitor vs Freeform bet identity (see Read First).

---

## Files Referenced in This Brief

| File | What it is |
|---|---|
| `src/screens/ChallengeScreen.jsx` | The entire current implementation — cards, create modal, wallet tab, all live here in one file |
| `src/hooks/useChallenges.js` | Data layer — will gain a `circleId` param per the tech spec |
| `src/hooks/useWallet.js` | Wallet balance/escrow/transactions — unaffected by this work, referenced by the sidebar mini-card |
| `docs/platform_revision/architecture/P2P_BETTING_CLUBHOUSE_SCOPE_TECH_SPEC.md` | Companion technical spec — full data model, RPC contracts, migration plan |
| `docs/platform_revision/architecture/P2P_BETTING_SYSTEM_DESIGN.md` | Original coin-economy design (rake, escrow, ledger) — unchanged by this work, background only |
| `docs/platform_revision/design/design_handoffs/clubhouse_core/README.md` | Sibling brief — token table, sidebar spec, multi-Clubhouse switcher this screen inherits |

---

Last Updated: **2026-07-24**
