# Draft Leagues — Unlimited Transfers

**Draft leagues (including Draft+H2H) have no per-round transfer limit and no penalty buys. This document covers the implementation and how to revert it.**

---

## Overview

Classic leagues enforce **3 free buy transfers per round** (configurable via `transfers_per_round` in `league_config`), with extra buys costing penalty points (`transfer_penalty`, default −4 pts each, tracked in `squads.penalty_transfers`).

Draft leagues are squad-management competitions where every player is drafted once and owned by exactly one manager (`league_mode = 'draft'`, `format = 'noduplicate'` — covers both standard Draft and Draft+H2H). Because the player pool is already exclusive, the per-round limit and penalty mechanism serve no purpose and only add friction. Draft leagues now have **fully unlimited buys and sells, with no point penalty**.

Classic leagues are unaffected — all existing limit/penalty/quota behaviour is unchanged.

---

## Implementation

### `supabase/functions/process-transfer/index.js`

After the existing pre-competition / initial-build / free-window bypasses that null out `limitMatchdayId`, a new check forces the same bypass for any draft-mode league:

```js
// Draft leagues: unlimited transfers (no free-transfer cap, no penalty buys).
// league_mode is 'draft' for both standard draft and draft+H2H leagues
// (format='noduplicate'); 'classic' leagues keep the per-round limit.
if (leagueMode === 'draft') {
  limitMatchdayId = null;
}
```

`leagueMode` is fetched once near the top of the function (`membership?.leagues?.league_mode`). Passing `p_matchday_id = null` to `execute_transfer_atomic` skips both the limit check and the `round_transfers`/`penalty_transfers` counter writes — the same mechanism already used by the pre-competition and initial-build-exemption bypasses, so no new RPC logic is required.

### `src/screens/MarketScreen.jsx`

A single `isDraftLeague` flag (`leagueFormat === 'noduplicate'`) gates two client-side displays:

- **`penaltyPointsCost`** useMemo — returns `0` for draft leagues (alongside the existing unlimited-window, initial-build, and pre-competition cases). The basket never shows a `−Xpts` penalty warning for draft leagues.
- **Transfer quota chip** (`isUnlimited`) — `isDraftLeague` is OR'd into the existing unlimited conditions, so the chip always shows `∞ free` for draft leagues.

`isDraftLeague` was previously declared inline (further down, for the "taken by other manager" check) — it's now a single top-level `const` reused everywhere.

### `src/components/ScoringInfoModal.jsx`

The TRANSFERS section (Scoring tab) and the transfer-window OPEN/CLOSED descriptions (Game Rules tab) now explicitly distinguish Draft leagues (unlimited, no penalty) from Classic leagues (3 free buys, −4 pts/extra).

### `docs/architecture/TRANSFERS_AND_LINEUP_GUIDE.md`

Banner note at the top + inline callouts in the "Per-Round Limits" and "Operations exempt from the counter" sections pointing here.

---

## Reverting

To restore the per-round limit for draft leagues:

1. Remove the `if (leagueMode === 'draft') { limitMatchdayId = null; }` block from `process-transfer/index.js`.
2. Remove `isDraftLeague` from the `penaltyPointsCost` early-return list and from the `isUnlimited` OR-chain in `MarketScreen.jsx` (leave the inline `isDraftLeague` declaration used by the "taken by other manager" check, or re-inline it if this doc's consolidation is also reverted).
3. Revert the `ScoringInfoModal.jsx` and `TRANSFERS_AND_LINEUP_GUIDE.md` copy changes.

No database migration or data backfill is involved — this is purely a server/client logic + copy change.

---

## Related Documents

- [TRANSFERS_AND_LINEUP_GUIDE.md](TRANSFERS_AND_LINEUP_GUIDE.md) — full transfer window / limit / lineup reference
- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — deep technical spec (DB functions, config table)

Last Updated: 2026-06-10
