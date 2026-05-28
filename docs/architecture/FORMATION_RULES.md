# Formation Rules — Forza Fantasy League

**Complete specification for 11-player pitch validation and squad formation constraints.**

---

## Standard Formation (EPL League)

**Valid formations**: 3-5-2, 3-4-3, 4-3-3, 4-4-2, 4-5-1, 5-2-3, 5-3-2, 5-4-1

**Position constraints**:
| Position | Min | Max | Abbreviation |
|----------|-----|-----|--------------|
| Goalkeeper | 1 | 1 | GK |
| Defender | 3 | 5 | DEF |
| Midfielder | 2 | 5 | MID |
| Forward | 1 | 3 | FWD |
| **Total** | **11** | **11** | — |

**Formula**: GK + DEF + MID + FWD = 11 players, with each position within its min/max bounds.

---

## Position Multipliers (Fantasy Points)

**Captain Chip** (×2): Doubles raw fantasy points for selected player. One captain per squad per gameweek.

**Triple Captain** (×3): Triples raw fantasy points. Rare power tool, limited uses per season.

**Joker Chip** (×2): Applied to single player during live match. Activates after kickoff, can't be changed.

**Wildcard** (×1.1): Applies to entire squad total for one gameweek. Stacks with captain but applies after captain multiplication.

---

## Constraints & Validations

### Squad Composition
- Exactly 11 players on pitch (no subs in MVP)
- Position distribution must be valid formation
- No duplicate players in one squad
- All players from same tournament (EPL, WC, etc.)

### Transfer Rules
- Players can move between teams (trades, transfers, auctions)
- Cannot bench own captain (defensive validation)
- Transfer window: Active during specified deadline periods
- Transfers cost from squad budget (player price from Forza API or fallback)

### Scoring Eligibility
- Player must have `status = 'active'` (not injured/suspended) at captain-selection time
- Player must appear in fixture lineup to earn points
- Sub players ineligible (MVP has no bench)

---

## Multi-Tournament Support

**Parameterizable positions** (Phase 2b goal):
- Different tournaments may have different position configs
- Store in `league_config.position_caps` as JSONB
- Fallback to standard 11-player EPL if not set
- Example: World Cup could allow 12 forwards, 0 defenders (hypothetical)

---

## Related Documents

- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Lottery & transfer window rules
- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Point calculation details
- [APP_DYNAMICS.md](APP_DYNAMICS.md) — Live match & chip selection

---

Last Updated: 2026-05-28
