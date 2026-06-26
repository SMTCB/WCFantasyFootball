# FORZAKIT — Player Modals Handoff

> **Visual reference:** open `Player Modals.html` in a browser.  
> All components are rendered interactively on a design canvas.  
> Click any artboard to fullscreen it. Click GW rows in the Stats Dashboard to see the breakdown update live.

---

## What's in this package

| File | Purpose |
|------|---------|
| `Player Modals.html` | Interactive design reference — all components rendered |
| `squad-shared.css` | Design tokens (colours, spacing, radii, fonts) |
| `tokens.css` | Alias token file — same values, flat import |
| `design-canvas.jsx` | Canvas wrapper — only needed to view the design file |
| `squad-data.jsx` | Mock data shapes — use as type reference |
| `README.md` | This file |

---

## Components to build

### 1 · PlayerStatsDashboard
A full stats modal that opens when the user taps **STATS ↗** in the player history summary row.

### 2A · PlayerActionModal (mode: full)
Redesigned click-on-player sheet — shown when the squad is **unlocked / in transfer mode**.  
Includes form bars, next fixture, ownership context, and action buttons.

### 2B · PlayerActionModal (mode: minimal)  
Same sheet but **stripped** — shown when the squad is **locked / deadline passed / live matches**.  
Identity + action buttons only.

---

## 1 · PlayerStatsDashboard

### Trigger
In the player history row, add a **STATS ↗** button to the right of the summary line:

```
1 APPS · 2G · 0A · 10 PTS · AVG 10.0/GW          [STATS ↗]
```

`onClick` → open `PlayerStatsDashboard` modal for that player.

### Layout (desktop)
```
┌─────────────────────────────────────────────────────────────────┐
│  [POS]  PLAYER NAME ▲   ● COUNTRY · CLUB · STATUS   PRICE  [✕] │
├──────┬──────┬──────┬──────────┬──────────┬────────────────────┤
│ APPS │  G   │  A   │ TOTAL PTS│  AVG/GW  │     OWNED BY       │  ← key stats
├──────┴──────┴──────┴──────────┴──────────┴────────────────────┤
│ POS STATS │ stat 1 │ stat 2 │ stat 3 │ stat 4                  │  ← position stats
├─────────────────────────────┬───────────────────────────────────┤
│  GW HISTORY                 │  POINT BREAKDOWN                  │
│  GW │ FIXTURE │MIN│ G│ A│PTS│  [GW pill] fixture name          │
│ ▶R1 │ UNI(H)  │72'│ 2│ 0│ 10│  APPEARANCE (72')       +2      │
│  R2 │ PAR(A)  │90'│ 0│ 1│  4│  GOALS × 2 (FWD=4)      +8      │
│  …  │  …      │…  │ …│ …│  …│  ──────────────────────────     │
│                             │  TOTAL                   10      │
│  [POINTS HISTORY chart]     │  [scoring rules note]            │
└─────────────────────────────┴───────────────────────────────────┘
```

**Mobile layout:** full-screen view with two tabs — HISTORY and BREAKDOWN.  
Tapping a row in HISTORY auto-switches to BREAKDOWN tab for that fixture.

### Data interface

```typescript
// PLUGIN: player object — from your squad store
interface Player {
  id: string;
  name: string;                           // e.g. "FOLARIN BALOGUN"
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  country: string;
  club: string;
  price: string;                          // e.g. "€7M"
  status: 'fit' | 'doubt' | 'out';
  trend: 'up' | 'down' | 'neutral';
  isLocked: boolean;
  ownershipPct: number;                   // e.g. 14.2
}

// PLUGIN: one object per played gameweek — from player.gwHistory
interface GWRecord {
  gw: string;                             // e.g. "R1", "GW12"
  fixture: string;                        // e.g. "UNI vs PAR"
  isHome: boolean;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltyMiss: number;
  bonusPts: number;
  totalPts: number;                       // authoritative score from your engine
}

// Component props
interface PlayerStatsDashboardProps {
  player: Player;
  gwHistory: GWRecord[];                  // PLUGIN: player.gwHistory
  onClose: () => void;
}
```

### Scoring engine / point breakdown

The breakdown panel computes how `totalPts` was built for the **selected GW row**.  
Replace the mock `buildBreakdown()` function with one that reads from your `league.scoringConfig`:

```typescript
// PLUGIN: replace with your real scoring engine
function buildBreakdown(gw: GWRecord, position: string, scoringConfig: ScoringConfig): BreakdownItem[] {
  // Current mock rules — adjust to match league.scoringConfig:
  //   Appearance < 60 min  →  scoringConfig.appPointsPartial   (mock: 1)
  //   Appearance ≥ 60 min  →  scoringConfig.appPointsFull      (mock: 2)
  //   Goal — GK/DEF        →  scoringConfig.goalPoints.DEF     (mock: 6)
  //   Goal — MID           →  scoringConfig.goalPoints.MID     (mock: 5)
  //   Goal — FWD           →  scoringConfig.goalPoints.FWD     (mock: 4)
  //   Assist               →  scoringConfig.assistPoints       (mock: 3)
  //   Clean sheet — GK/DEF →  scoringConfig.csPoints.DEF       (mock: 4)
  //   Clean sheet — MID    →  scoringConfig.csPoints.MID       (mock: 1)
  //   Clean sheet — FWD    →  scoringConfig.csPoints.FWD       (mock: 0)
  //   Yellow card          →  scoringConfig.yellowCardPts      (mock: -1)
  //   Red card             →  scoringConfig.redCardPts         (mock: -3)
  //   Own goal             →  scoringConfig.ownGoalPts         (mock: -2)
  //   Penalty miss         →  scoringConfig.penaltyMissPts     (mock: -2)
  //   Bonus points         →  gw.bonusPts (variable 0–3)
}

interface BreakdownItem {
  label: string;                          // e.g. "GOALS × 2  (FWD = 4 PTS EACH)"
  pts: number;                            // e.g. 8
  kind: 'pos' | 'neg' | 'bonus';         // controls colour: green / red / gold
}
```

**Important:** `gw.totalPts` is the authoritative score from your backend.  
The breakdown is for **display only** — do not re-derive `totalPts` from it.

### Position-specific stats strip

4 stats shown below the main stats strip, varying by position.  
Stats derivable from `gwHistory` are computed locally. Others require your stats provider.

```typescript
// PLUGIN: connect provider API stats (football-data.org, FBref, Opta, etc.)
const POSITION_STATS = {
  GK: [
    { label: 'CLEAN SHEETS', source: 'gwHistory',              key: 'cleanSheet'          },
    { label: 'SAVES',        source: 'provider',               key: 'player.stats.saves'  },
    { label: 'PEN SAVES',    source: 'provider',               key: 'player.stats.penaltySaves' },
    { label: 'CONCEDED',     source: 'provider',               key: 'player.stats.goalsConceded' },
  ],
  DEF: [
    { label: 'CLEAN SHEETS', source: 'gwHistory',              key: 'cleanSheet'          },
    { label: 'GOALS',        source: 'gwHistory',              key: 'goals'               },
    { label: 'ASSISTS',      source: 'gwHistory',              key: 'assists'             },
    { label: 'TACKLES',      source: 'provider',               key: 'player.stats.tackles' },
  ],
  MID: [
    { label: 'GOALS',        source: 'gwHistory',              key: 'goals'               },
    { label: 'ASSISTS',      source: 'gwHistory',              key: 'assists'             },
    { label: 'KEY PASSES',   source: 'provider',               key: 'player.stats.keyPasses' },
    { label: 'CHANCES',      source: 'provider',               key: 'player.stats.chancesCreated' },
  ],
  FWD: [
    { label: 'GOALS',        source: 'gwHistory',              key: 'goals'               },
    { label: 'ASSISTS',      source: 'gwHistory',              key: 'assists'             },
    { label: 'SHOTS ON TGT', source: 'provider',               key: 'player.stats.shotsOnTarget' },
    { label: 'xG',           source: 'provider',               key: 'player.stats.xG'    },
  ],
};
// When provider stat is unavailable, show "—" (already handled in design).
```

---

## 2A · PlayerActionModal — mode: full

**When to use:** squad unlocked, transfer window open, pre-deadline.

### Layout
```
┌───────────────────────────────────────────────┐
│  [POS]  PLAYER NAME           PRICE       [✕] │
│         COUNTRY · CLUB · ● STATUS             │
├─────────────────────────┬─────────────────────┤
│  LAST N GWS             │  NEXT FIXTURE        │
│  [form bar chart]       │  TOT vs CHE          │
│                         │  [difficulty bar]    │
├─────────────────────────┴─────────────────────┤
│  OWNED BY  22.8%    [+ any extra quick stats] │
├───────────────────────────────────────────────┤
│  [        MAKE CAPTAIN        ] (gold)         │
│  [   SUB OUT   ]  [   SELL    ]                │
│  [ VIEW FULL STATS DASHBOARD ↗] (ghost)        │
└───────────────────────────────────────────────┘
```

### Data interface

```typescript
interface PlayerActionModalAProps {
  player: Player & {
    isCaptain: boolean;
    nextFixture: string;                  // PLUGIN: player.nextFixture
    fixtureDifficulty: number;            // PLUGIN: 1 (easy) → 5 (hard)
  };
  form: number[];                         // PLUGIN: player.recentForm — last N GW totals, oldest→newest
  onClose: () => void;
  onMakeCaptain: () => void;              // already connected per your note
  onSubOut: () => void;                   // already connected
  onSell: () => void;                     // already connected
  onViewStats: () => void;                // opens PlayerStatsDashboard for this player
}
```

### Fixture difficulty colour scale
```
1–2  → var(--positive)   #22C55E   EASY
3    → var(--gold)        #E0A800   MEDIUM
4–5  → var(--danger)      #EF4444   HARD
```

---

## 2B · PlayerActionModal — mode: minimal

**When to use:** squad locked, deadline passed, live matchday.

### Layout
```
┌───────────────────────────────────────────────┐
│  [POS]  PLAYER NAME           PRICE       [✕] │
│         COUNTRY · CLUB · ● STATUS             │
├───────────────────────────────────────────────┤
│  [        MAKE CAPTAIN        ] (gold)         │
│  [   SUB OUT   ]  [   SELL    ]                │
│  [ VIEW FULL STATS DASHBOARD ↗] (ghost)        │
└───────────────────────────────────────────────┘
```

### Data interface

```typescript
interface PlayerActionModalBProps {
  player: Player & {
    isCaptain: boolean;
  };
  onClose: () => void;
  onMakeCaptain: () => void;
  onSubOut: () => void;
  onSell: () => void;
  onViewStats: () => void;
}
```

---

## Shared: which modal mode to show

```typescript
// PLUGIN: determine which modal variant to render
function getActionModalMode(squadState: SquadState): 'full' | 'minimal' {
  if (squadState.isLocked || squadState.isLiveMatchday || squadState.isPastDeadline) {
    return 'minimal';   // → PlayerActionModalB
  }
  return 'full';        // → PlayerActionModalA
}
```

---

## Design tokens reference

All tokens live in `squad-shared.css` and `tokens.css`. Key values:

```css
/* Surfaces */
--ink:      #080A0E   /* page background */
--ink-2:    #0F1218   /* modal / card background */
--ink-3:    #161B25   /* elevated surface */
--rule:     #1E2530   /* all borders and dividers */

/* Foreground */
--paper:    #F2EEE5   /* primary text */
--mute:     #8B95A1   /* secondary / label text */

/* Accents */
--cyan:     #00B4D8   /* primary accent, selected states */
--gold:     #E0A800   /* captain, bonus, warnings */
--positive: #22C55E   /* goals, positive pts, fit status */
--danger:   #EF4444   /* negative pts, sell, injured, FWD */

/* Position colours */
--pos-gk:   #A855F7   /* purple */
--pos-def:  #00B4D8   /* cyan */
--pos-mid:  #E0A800   /* gold */
--pos-fwd:  #EF4444   /* red */
```

### Typography
```
Display headings  →  Archivo Black, 900 weight, uppercase, letter-spacing: -0.01em
Labels / eyebrows →  JetBrains Mono, uppercase, letter-spacing: 0.14–0.22em
Body              →  Archivo, 400–600 weight
```

---

## States to implement

| State | Notes |
|-------|-------|
| Loading | Skeleton placeholders for gwHistory rows and position stats — show muted rectangles |
| Empty gwHistory | "— NO GAMEWEEKS PLAYED —" in mono label style; chart area hidden |
| Provider stats unavailable | Show `—` for that stat cell (already in design) |
| No fixture selected (breakdown panel) | "TAP ANY GW ROW" instructional label |
| isCaptain = true | Gold MAKE CAPTAIN button changes label to "REMOVE CAPTAIN" |
| Player injured/doubt | Status dot + STATUS_LBL changes colour; SUB OUT may be hidden |

---

## Responsive breakpoints

| Breakpoint | Behaviour |
|------------|-----------|
| ≥ 900px | Stats Dashboard: side-by-side panels (GW table left, breakdown right) |
| < 900px | Stats Dashboard: tabbed layout (HISTORY / BREAKDOWN tabs) |
| ≥ 460px | Action Modal: standard modal, centered on overlay |
| < 460px | Action Modal: bottom sheet, anchored to viewport bottom |

---

## File structure suggestion for implementation

```
src/
  components/
    player/
      PlayerStatsDashboard.tsx       ← component 1
      PlayerStatsDashboard.mobile.tsx
      PlayerActionModal.tsx           ← wrapper — picks A or B
      PlayerActionModalFull.tsx       ← component 2A
      PlayerActionModalMinimal.tsx    ← component 2B
      playerModal.utils.ts            ← buildBreakdown(), getActionModalMode()
      playerModal.types.ts            ← Player, GWRecord, BreakdownItem interfaces
      playerModal.constants.ts        ← POS_STATS_CFG, SCORING_RULES
```
