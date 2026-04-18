# Project Backlog — FantasyKit

This backlog tracks the development of new features for the FantasyKit platform. Features are ranked by **Matchday Growth Impact**.

---

## 🚀 PRIORITY: GROWTH & ENGAGEMENT (Matchday Recap)

### [x] Feature 02: Matchday Recap Card (Shareable)
- **Status**: ✅ Implemented (Phase 1 — Mock Data)
- **Route**: `/recap`
- **Entry Point**: Teaser card on Home Screen (`/`)
- **Key Deliverables**:
    - [x] In-app Recap view (rank, points, best player, captain, joker, transfers).
    - [x] Off-screen `RecapCard` component captured by `html2canvas`.
    - [x] Native `navigator.share()` for WhatsApp / Instagram with fallback.
    - [x] Save to device as PNG.
    - [x] Copy text fallback for non-share-capable browsers.
- **Next**: Replace mock data with real Supabase `MatchdayRecap` queries once the table is seeded post-matchday.

### [x] Feature 07: Top Scorer Prediction
- **Status**: ✅ Implemented (Phase 1 — Mock Player Pool)
- **Entry Point**: Daily Prediction card on Home Screen (`/`)
- **Key Deliverables**:
    - [x] Pre-match prediction card embedded in Home Screen.
    - [x] `PredictionModal` — bottom sheet with search and smart "predicted goals" sorting.
    - [x] Supabase `top_scorer_predictions` table (schema added to migration).
    - [x] UPSERT logic so users can change their pick before lock.
    - [x] Post-matchday result states (✅ correct / ❌ wrong / pending).
- **Next**: Replace mock player pool with live fixture player lists from Supabase.

---

### [x] Feature 03: Live Projections
- **Status**: ✅ Implemented (Phase 1 — Mock Squad / Position Averages)
- **Engine**: `src/lib/projections.js` — standalone utility, framework-agnostic
- **Entry Point**: Live Center tab (`/live`)
- **Key Deliverables**:
    - [x] `calculateProjection()` — formula: `current_pts + Σ(avg_per_90 × remaining_minutes/90)`, conservative rounding.
    - [x] `formatProjectionDisplay()` — trend arrows (↑ ↓ —), colour coding (green/red/grey).
    - [x] Live→Projected split progress bar with ghost "remaining" fill.
    - [x] Rival Watch rows: live pts pill + `→ N proj.` sub-label for all users.
    - [x] Match progress bar on each fixture ticker card.
    - [x] 5-minute auto-refresh cycle with swing smoothing (max ±5 pts per cycle).
    - [x] `isStable` state: shows "Stable · Xs ago" when unchanged.
- **Next**: Feed real squad positions from Supabase `squads` table into engine.

---

## 🧠 PRE-MATCH INTELLIGENCE

### [x] Feature 01: Predicted Lineups & Injury Alerts
- **Status**: ✅ Implemented (Phase 1 — Mock Intelligence Data)
- **Engine**: `src/lib/intelligence.js` — player status registry (likely/doubtful/bench/out)
- **Entry Point**: Squad Screen (`/squad`) — above the pitch view
- **Key Deliverables**:
    - [x] `DangerZone` component — collapsible warning panel listing at-risk players.
    - [x] Status pills: 🟢 Likely / 🟡 Doubtful / 🟠 Bench / 🔴 OUT with confidence % and reason text.
    - [x] OUT players show "Auto-sub?" badge and can be tapped to open action sheet.
    - [x] `PlayerCard` updated: coloured status dot (top-left), red ring on at-risk, amber name label.
    - [x] Intelligence active on **both** pitch view and bench.
    - [x] "All Clear" empty state when no players at risk.
- **Next**: Replace mock data with live API-Football injury/lineup feed.

---

## 🏆 SOCIAL & RIVALRY

### [x] Feature 05: Head-to-Head Records (H2H)
- **Status**: ✅ Implemented (Phase 1)
- **Entry Point**: League Leaderboard -> tap "H2H" button
- **Key Deliverables**:
    - [x] `H2HSheet` bottom sheet with backdrop.
    - [x] W/D/L scoreboard (green/grey/red).
    - [x] Win % bar.
    - [x] SVG sparkline (zero-dependency points chart).
    - [x] Milestone cards: Biggest Win / Biggest Loss / Closest Match.
    - [x] Streak badge: Win streak or Loss streak.
    - [x] Separate "Trade" and "H2H" buttons on leaderboard rows.
- **Next**: Calculate from real matchday_scores table.

---

## ⚡ STRATEGIC POWER-UPS (Chips)

### [x] Feature 09: Wildcard Matchday
- [x] Implement "Activate Wildcard" chip handling (Once per tournament).
- [x] Build Transfer Cost override (Set cost to 0/unlimited when active).

### [x] Feature 10: Triple Captain Chip
- [x] Build 3× multi-badge UI.
- [x] Implement the "All-or-Nothing" scoring logic (0 pts if benched).

---

## 🎲 VARIANT MODES & ANALYTICS

### [x] Feature 08: Captain Roulette Mode
- [x] Add "Chaos" toggle in League Settings or manual spin.
- [x] Implement server-side/client-side random assignment with animations.

### [x] Feature 11: League Analytics Dashboard
- [x] Create "Stats" tab in League View.
- [x] Visualizations: Cumulative points sparklines and Rank movement charts.

### [x] Feature 06: Bracket Challenge
- [x] Separate tab/mini-game for knockout prediction.
- [x] Build the interactive Bracket Tree UI.

### [x] Feature 04: VAR Handling
- [x] Implement "📺 Under Review" states in Activity Feed.
- [x] Build "Goal Reversed" notification and rank impact animations.
