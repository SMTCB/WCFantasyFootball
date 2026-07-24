# Handoff: Coin Challenges — Clubhouse Scope + Freeform Bets

## Overview
Extends the existing Coin Challenges feature (peer-to-peer, coin-staked bets between two Clubhouse members) from single-league scope to **Clubhouse scope** — any member can challenge any other member — and adds a second bet type, **Freeform prop bets**, with a net-new declare → confirm/dispute → owner-arbitrates lifecycle. See `README_COIN.md` for the full product rationale, data model pointers and file references from the engineering companion doc.

## About the Design Files
`Coin Challenges — Clubhouse Scope.html` is a **design reference built in HTML** — a pannable canvas (`design_doc_mode`) of static, high-fidelity mockups grouped into screens S01–S10, each pairing a desktop (1440) artboard directly with its mobile (390) counterpart. Open it in a browser; pan/scroll/zoom to see all frames. **This is not production code** — recreate these screens in the target codebase's existing environment (React per `ChallengeScreen.jsx`), reusing its real components (`IncomingCard`, `OpenCard`, `ActiveCard`, `SettledCard`, member-row/Members-tab pattern, wallet sidebar) rather than copying this markup.

## Fidelity
**High-fidelity.** Colors, type, spacing and copy are final Kit Light tokens (see `kit-tokens.css` and the Design Tokens section below) — recreate pixel-perfectly.

## Screens / Views

- **S01 — Coin Challenges Hub (owner view)**: Sidebar (Coin Challenges item, BETA tag) + dark header with Clubhouse breadcrumb ("🏠 THE USUAL SUSPECTS") and wallet stat + New Challenge CTA. Content sections top-to-bottom: **Arbitration Needed** (owner-only, purple dashed), **Your Move** (mid-declaration cards needing confirm/dispute, or read-only "awaiting them"), **Incoming** (accept/decline, Competitor gold vs Freeform blue), **Live** (Competitor scorecard vs Freeform question card with Declare Result), **Sent — Awaiting Accept**, **History** (type badge + question text + "resolved by [owner]" note where applicable). Right rail: wallet mini-card, season record, "how it works" card.
- **S02 — Create Challenge · Step 1 (Bet Type)**: Two large option cards, Competitor ("Bet on a real result") vs Freeform ("Bet on anything"), each with icon + description. Selecting determines the rest of the flow.
- **S03 — Step 2 (Opponent Picker)**: Search bar + scrollable member rows (avatar, name, rank), reusing the Members-tab row pattern. Radio-style selection.
- **S04 — Step 3a (Competitor detail)**: Competition chips (football league / F1 paddock / tennis box) then, for football only, a gameweek chip row (current/next).
- **S05 — Step 3b (Freeform detail)**: Required "Question" field with live 140-char countdown, optional "Message" field underneath (flavor/trash-talk).
- **S06 — Step 4 (Stake & Review)**: Stake chips (50/100/250/500/custom) + range slider, live net-win-after-5%-rake calc box, one-line review summary, submit button (gold for Competitor, blue for Freeform).
- **S07 — Empty states**: "Nobody to challenge yet" (roster = just you, CTA to invite) and "No competitions yet" (Competitor path with zero competitions, CTA to add one + pivot link to Freeform).
- **S08 — Freeform lifecycle**: Four states side by side — Live (question, Declare Result button), Your Move (mid-declaration: proposed winner + Confirm/Dispute), Disputed (neutral dashed "pending arbitration," frozen escrow copy), Settled (mutual vs owner-resolved history rows).
- **S09 — Declare Result flow**: Modal-style screen — pick winner (you / opponent / push-no-winner) as radio rows, inline warning strip acting as the confirmation gate before "Submit declaration."
- **S10 — Owner Arbitration**: Inline alert card ("Review & decide") expanding into a decision view showing both parties' claims side by side, stake amount, and three actions (Award A / Award B / Void — return stakes).

## Interactions & Behavior
- Bet-type choice (S02) branches the flow: Competitor → competition/gameweek (S04); Freeform → question/message (S05). Both rejoin at stake (S06).
- Freeform lifecycle: Live → either party taps **Declare Result** (S09) → opposing party sees **Your Move** card → **Confirm** settles immediately (95%/5% rake split, same as Competitor payout) or **Dispute** freezes stakes and routes to **Owner Arbitration** (S10) → owner's single decision settles unilaterally.
- Declare Result requires no separate confirmation dialog — the inline warning strip inside the same screen ("real coins move once they respond") is the deliberate friction point before submit.
- Empty states (S07) block challenge creation entirely rather than showing an empty picker/list.
- Member/competition rows use single-select (radio dot), not multi-select.

## State Management
- `betType`: `'competitor' | 'freeform'` — set in step 1, drives which subsequent step (S04 vs S05) renders and the accent color used for that challenge's badges/buttons throughout its lifecycle.
- Freeform challenge lifecycle status: `live → declared (mid-declaration) → confirmed (settled) | disputed → arbitrated (settled)`.
- `declaredBy` / `declaredWinner`: set when a party proposes a result; drives the "Your Move" card's copy (who declared, what they claimed) for the other party, and the read-only "awaiting them" card for the declarer.
- Arbitration needs both parties' claims stored distinctly (they may disagree) for the owner decision view.
- History rows need: bet type, resolution path (`mutual` vs `arbitrated`, plus which owner if arbitrated), and either a score line (Competitor) or the original question text (Freeform).

## Design Tokens
See `kit-tokens.css` for the full reconciled Kit Light token set. Key values used on this screen:

| Token | Hex/value | Usage |
|---|---|---|
| `--gold` | `#B8720E` | Competitor bet identity — stakes, primary CTA, incoming-card border |
| `--accent` | `#1A6FA8` | Freeform bet identity (new decision this brief made) — badge, live/your-move border, CTA |
| `--pos` / `--neg` | `#166534` / `#B91C1C` | Win/loss amounts, leading/behind states |
| `--mute` | `#8A97A8` | Disputed/pending-arbitration treatment — neutral dashed border, frozen-state copy |
| Owner/arbitration purple | `#8C49C9` | Borrowed from the existing GK position tone, repurposed as a one-off "owner action" role marker — not a new bet-type color |
| Typography | Archivo Black (headline numbers, names), Archivo (body), JetBrains Mono (eyebrows/labels, sparingly) |
| Radius | 6px throughout |

Full color rationale (why gold stays Competitor, why blue was chosen for Freeform, why disputes are neutral not colored) is written out in the design file's own frame `00 — Composition point of view`.

## Assets
No image assets — coin icon is a CSS gradient circle, all avatars are colored initial circles (decorative, not tied to any brand asset).

## Files
- `Coin Challenges — Clubhouse Scope.html` — all design frames (S01–S10 + doc panel)
- `README_COIN.md` — original product brief this design responds to (scope, priorities, data-model pointers)
- `kit-tokens.css` — Kit Light design tokens referenced above
