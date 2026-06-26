# Commissioner Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a re-triggerable commissioner guide inside the app — a polished `?` replay button in the Admin panel header and an expanded commissioner tour (8 steps) covering the full lifecycle: league creation context → draft → weekly transfer flow → bets → scoring.

**Architecture:** All infrastructure already exists. `OnboardingTour` renders spotlight tooltips via `data-tour` attributes. `useOnboarding` manages per-screen tour flags with `replayCommissionerTour()`. `CommissionerPanel` already receives `replayCommissionerTour` as a prop but never renders a button. This plan: (1) redesigns the replay button style to match the brand (replacing the plain `?` circle in BetsTabHub), (2) extracts it into a shared `TourReplayButton` component used by both panels, (3) adds `data-tour` anchors to the existing zones in `CommissionerPanel`, and (4) expands `COMMISSIONER_TOUR_STEPS` from 4 → 8 steps covering the full commissioner flow.

**Tech Stack:** React 19, Tailwind CSS 4, existing `OnboardingTour.jsx`, `useOnboarding.js`, `CommissionerPanel.jsx`, `BetsTabHub.jsx`, `LeagueScreen.jsx`

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/components/TourReplayButton.jsx` | **CREATE** | Shared branded replay button component |
| `src/components/league/CommissionerPanel.jsx` | **MODIFY** | Accept `replayCommissionerTour` prop, render `TourReplayButton`, add `data-tour` anchors to 8 zone elements |
| `src/components/league/BetsTabHub.jsx` | **MODIFY** | Replace inline `?` button with `TourReplayButton` |
| `src/screens/LeagueScreen.jsx` | **MODIFY** | Expand `COMMISSIONER_TOUR_STEPS` from 4 → 8 entries |

---

## Task 1: Create `TourReplayButton` component

**Files:**
- Create: `src/components/TourReplayButton.jsx`

The existing replay button in `BetsTabHub` is a plain 28px circle with `?` text and low-contrast muted styling — it blends into the background and doesn't match the brand. The new component uses the gold accent, JetBrains Mono label, and the brand's editorial uppercase style. It renders as a fixed FAB-style button (bottom-right of its containing panel) only when `onReplay` prop is truthy.

- [ ] **Step 1: Create the component**

```jsx
// src/components/TourReplayButton.jsx
/**
 * TourReplayButton — branded replay button for onboarding tours.
 * Renders a fixed-position pill (bottom-right of the viewport content area)
 * that fires onReplay() when clicked. Only renders when onReplay is provided.
 *
 * Used by: CommissionerPanel, BetsTabHub
 */

const MONO = "'JetBrains Mono', monospace";

export default function TourReplayButton({ onReplay, label = 'REPLAY GUIDE' }) {
  if (!onReplay) return null;

  return (
    <button
      onClick={onReplay}
      title="Replay the commissioner guide"
      style={{
        position:      'fixed',
        bottom:        88,          // above bottom nav bar (~72px)
        right:         20,
        zIndex:        200,
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        padding:       '8px 14px 8px 10px',
        background:    'var(--ink-2)',
        border:        '1px solid rgba(224,168,0,0.45)',
        borderRadius:  '999px',
        cursor:        'pointer',
        boxShadow:     '0 4px 20px rgba(0,0,0,0.5)',
        transition:    'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(224,168,0,0.08)';
        e.currentTarget.style.borderColor = 'rgba(224,168,0,0.8)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--ink-2)';
        e.currentTarget.style.borderColor = 'rgba(224,168,0,0.45)';
      }}
    >
      {/* Gold circle with ? glyph */}
      <span style={{
        width:         20,
        height:        20,
        borderRadius:  '50%',
        background:    'rgba(224,168,0,0.15)',
        border:        '1px solid rgba(224,168,0,0.6)',
        color:         'var(--gold)',
        fontFamily:    MONO,
        fontSize:      11,
        fontWeight:    700,
        display:       'flex',
        alignItems:    'center',
        justifyContent: 'center',
        flexShrink:    0,
        lineHeight:    1,
      }}>?</span>

      {/* Label */}
      <span style={{
        fontFamily:    MONO,
        fontSize:      9,
        letterSpacing: '.2em',
        color:         'var(--gold)',
        fontWeight:    600,
        whiteSpace:    'nowrap',
      }}>{label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify the file was created correctly**

```bash
# Should print the full file path
ls src/components/TourReplayButton.jsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TourReplayButton.jsx
git commit -m "feat: add TourReplayButton — branded gold pill FAB for tour replay"
```

---

## Task 2: Update `BetsTabHub` to use `TourReplayButton`

**Files:**
- Modify: `src/components/league/BetsTabHub.jsx`

Replace the existing plain `?` circle button (lines ~141–145) with the new shared component.

- [ ] **Step 1: Add import at top of `BetsTabHub.jsx`**

After the existing imports, add:
```jsx
import TourReplayButton from '../TourReplayButton';
```

- [ ] **Step 2: Replace the inline button block**

Find this block (around line 140):
```jsx
      {/* Tour replay */}
      {onReplayTour && (
        <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 10 }}>
          <button onClick={onReplayTour} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
        </div>
      )}
```

Replace with:
```jsx
      {/* Tour replay */}
      <TourReplayButton onReplay={onReplayTour} label="REPLAY BETS GUIDE" />
```

- [ ] **Step 3: Run lint to confirm no errors**

```bash
npm run lint 2>&1 | grep -E "BetsTabHub|TourReplay|error"
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/league/BetsTabHub.jsx
git commit -m "refactor: replace plain ? button in BetsTabHub with TourReplayButton"
```

---

## Task 3: Add `data-tour` anchors to `CommissionerPanel`

**Files:**
- Modify: `src/components/league/CommissionerPanel.jsx`

The tour steps in Task 4 will target 8 DOM elements via `data-tour` attributes. This task adds those attributes to existing rendered elements in `CommissionerPanel`. No layout changes — just attribute additions.

The 8 tour targets map to these zones:

| `data-tour` value | Zone in panel | What it points at |
|---|---|---|
| `comm-season-stepper` | Zone A (desktop + mobile) | The season phase stepper header bar |
| `comm-transfer-window` | Zone C / Mobile lifecycle | Transfer window card |
| `comm-draft-deadline` | Zone C / Mobile lifecycle | Draft deadline card |
| `comm-allocation` | Zone C / Mobile lifecycle | Run allocation button area |
| `comm-cup-phase` | Zone C / Mobile lifecycle | Cup seeding card |
| `comm-score-recalc` | Zone C / Mobile lifecycle | Score recalculation card |
| `comm-bets` | Zone B / Mobile bet creator | BetCreatorPanel wrapper |
| `comm-resolve` | Zone B / Mobile resolve | ResolvePendingBets wrapper |

- [ ] **Step 1: Add `data-tour="comm-season-stepper"` to `SeasonStepper` root div**

In `SeasonStepper` function, find the outermost `<div style={{ padding: '18px 28px 22px', borderBottom: ...`:

```jsx
// BEFORE
<div style={{ padding: '18px 28px 22px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>

// AFTER
<div data-tour="comm-season-stepper" style={{ padding: '18px 28px 22px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
```

- [ ] **Step 2: Add `data-tour` to `LifecycleOps` desktop cards**

In the `LifecycleOps` function's return, locate each `<LifecycleOp` usage and add a wrapping `<div data-tour="...">` around each:

```jsx
// Transfer Window card
<div data-tour="comm-transfer-window">
  <LifecycleOp
    title="TRANSFER WINDOW"
    {/* ... all existing props unchanged ... */}
  />
</div>

// Draft + Allocation card (one card covers both — target the draft card)
<div data-tour="comm-draft-deadline">
  <LifecycleOp
    title="DRAFT & ALLOCATION"
    {/* ... all existing props unchanged ... */}
  />
</div>

// Cup Phase card
<div data-tour="comm-cup-phase">
  <LifecycleOp
    title="CUP PHASE"
    {/* ... all existing props unchanged ... */}
  />
</div>

// Score Recalculation card
<div data-tour="comm-score-recalc">
  <LifecycleOp
    title="SCORE RECALCULATION"
    {/* ... all existing props unchanged ... */}
  />
</div>
```

> Note: `LifecycleOp` is an internal sub-component. Check the actual `title` prop values at lines ~1058–1200 to confirm exact matches before editing. Wrap the call site, not the component definition.

- [ ] **Step 3: Add `data-tour` to Zone B wrappers (desktop)**

In the desktop layout's Zone B (around line 1791), find the two column divs and add `data-tour`:

```jsx
{/* Zone B — Bet management (two columns) */}
<div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', ... }}>
  <div data-tour="comm-bets" style={{ borderRight: '1px solid var(--rule)', ... }}>
    <BetCreatorPanel ... />
  </div>
  <div data-tour="comm-resolve" style={{ ... }}>
    <ResolvePendingBets ... />
  </div>
</div>
```

- [ ] **Step 4: Add `data-tour` to mobile layout equivalents**

In the mobile layout block (around line 1699), add `data-tour` to the mobile wrappers for the same zones:

```jsx
{/* Create bet (mobile) */}
<MobSectionHeader label="CREATE BET" ... />
<div data-tour="comm-bets" style={{ padding: '0 14px' }}>
  <BetCreatorPanel ... />
</div>

{/* Resolve bets (mobile) */}
<MobSectionHeader label="RESOLVE PENDING" ... />
<div data-tour="comm-resolve" style={{ padding: '0 14px', ... }}>
  <ResolvePendingBets ... />
</div>
```

For mobile lifecycle cards, add to the `MobLifecycleCard` wrappers:
```jsx
<div data-tour="comm-transfer-window">
  <MobLifecycleCard title="TRANSFER WINDOW" ... />
</div>
<div data-tour="comm-draft-deadline">
  <MobLifecycleCard title="DRAFT & ALLOCATION" ... />
</div>
<div data-tour="comm-cup-phase">
  <MobLifecycleCard title="CUP PHASE" ... />
</div>
<div data-tour="comm-score-recalc">
  <MobLifecycleCard title="SCORE RECALCULATION" ... />
</div>
```

- [ ] **Step 5: Lint check**

```bash
npm run lint 2>&1 | grep -E "CommissionerPanel|error"
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/league/CommissionerPanel.jsx
git commit -m "feat: add data-tour anchors to CommissionerPanel (8 zones)"
```

---

## Task 4: Wire `TourReplayButton` + `replayCommissionerTour` prop into `CommissionerPanel`

**Files:**
- Modify: `src/components/league/CommissionerPanel.jsx`

`replayCommissionerTour` is already passed as a prop from `LeagueScreen` (line 1067) but the `CommissionerPanel` function signature doesn't declare it and never uses it.

- [ ] **Step 1: Add `replayCommissionerTour` to the function signature**

Find line 1665:
```jsx
export default function CommissionerPanel({ commissioner, leagueId, tournamentId, memberCount = 0, leagueName = 'LEAGUE' }) {
```

Change to:
```jsx
export default function CommissionerPanel({ commissioner, leagueId, tournamentId, memberCount = 0, leagueName = 'LEAGUE', replayCommissionerTour }) {
```

- [ ] **Step 2: Add `TourReplayButton` import**

At the top of `CommissionerPanel.jsx`, add (after the existing imports):
```jsx
import TourReplayButton from '../TourReplayButton';
```

- [ ] **Step 3: Render `TourReplayButton` in both mobile and desktop layouts**

In the mobile layout return (around line 1699, just before the closing `</div>` of the mobile return):
```jsx
        {/* Tour replay */}
        <TourReplayButton onReplay={replayCommissionerTour} label="REPLAY ADMIN GUIDE" />
      </div>
    );
  }
```

In the desktop layout return (around line 1820, just before the closing `</div>`):
```jsx
      {/* Zone C — Lifecycle ops */}
      <LifecycleOps commissioner={commissioner} leagueId={leagueId} />

      {/* Tour replay */}
      <TourReplayButton onReplay={replayCommissionerTour} label="REPLAY ADMIN GUIDE" />
    </div>
  );
```

- [ ] **Step 4: Lint check**

```bash
npm run lint 2>&1 | grep -E "CommissionerPanel|TourReplay|error"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/league/CommissionerPanel.jsx
git commit -m "feat: wire TourReplayButton into CommissionerPanel with replayCommissionerTour prop"
```

---

## Task 5: Expand commissioner tour to 8 steps in `LeagueScreen.jsx`

**Files:**
- Modify: `src/screens/LeagueScreen.jsx` (lines 71–92, the `COMMISSIONER_TOUR_STEPS` constant)

Replace the existing 4-step array with an 8-step array that tells the full commissioner lifecycle story. Each step has a `target` matching the `data-tour` attributes added in Task 3.

- [ ] **Step 1: Replace `COMMISSIONER_TOUR_STEPS`**

Find the current definition (lines 71–92):
```js
const COMMISSIONER_TOUR_STEPS = [
  {
    target: 'comm-transfer-window',
    title:  'Transfer Window',
    body:   'Set when the window opens and closes, and cap the number of transfers allowed per manager this matchday.',
  },
  {
    target: 'comm-draft-deadline',
    title:  'Draft Deadline',
    body:   'Managers must submit their draft before this date. After it passes, the lottery runs automatically.',
  },
  {
    target: 'comm-score-recalc',
    title:  'Score Recalculation',
    body:   'Re-run the scoring engine for any fixture by ID. Use this if a match result was corrected after the fact.',
  },
  {
    target: 'comm-bets',
    title:  'Create Bets',
    body:   'Post prediction challenges for your league. Choose a template or write a custom question, then set options and a deadline.',
  },
];
```

Replace with:
```js
const COMMISSIONER_TOUR_STEPS = [
  {
    target: 'comm-season-stepper',
    title:  'Season Lifecycle',
    body:   'This bar tracks your league\'s progress. Transfers open first, then draft, then allocation, cup seeding, and finally the live season. Each stage has its own controls below.',
  },
  {
    target: 'comm-transfer-window',
    title:  'Transfer Window',
    body:   'Open the window between gameweeks so managers can buy and sell players on the market. Set an opening and closing time — the system enforces the deadline automatically. Close it at least 1 hour before the first match kicks off.',
  },
  {
    target: 'comm-draft-deadline',
    title:  'Draft & Allocation',
    body:   'Managers submit their ranked player wishlist before this deadline. Once it passes, the lottery runs automatically and resolves conflicts using the relaxation algorithm. Click "Run Allocation" to trigger it manually if needed.',
  },
  {
    target: 'comm-cup-phase',
    title:  'Cup Phase',
    body:   'After allocation, seed the cup pool to assign one club per manager per round. The system prevents repeat picks across rounds. Run this once at the start of the cup phase — it cannot be undone for the season.',
  },
  {
    target: 'comm-score-recalc',
    title:  'Score Recalculation',
    body:   'If a match result was corrected after the final whistle (e.g. a goal disallowed by VAR), re-run the scoring engine here. Enter the fixture ID and hit Recalculate — squad scores update immediately.',
  },
  {
    target: 'comm-bets',
    title:  'Create Bets',
    body:   'Post prediction challenges for your managers before each gameweek. Pick a template (Top Scorer, Match Result, or Player Block), configure the options and reward points, then publish. Bets lock when the relevant match kicks off.',
  },
  {
    target: 'comm-resolve',
    title:  'Resolve Bets',
    body:   'After a match finishes, bet results that can\'t be auto-resolved will appear here. Select the correct answer to distribute reward points to winning managers. Match Result bets resolve automatically — only custom bets need manual resolution.',
  },
  {
    target: 'comm-bets',
    title:  'Weekly Gameweek Flow',
    body:   'Each gameweek: (1) Open transfer window → managers trade. (2) Close window 1h before kickoff. (3) Matches play — scores calculate automatically. (4) Create bets for next GW. (5) Resolve any pending bets. Repeat each round.',
  },
];
```

- [ ] **Step 2: Run lint**

```bash
npm run lint 2>&1 | grep -E "LeagueScreen|error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/LeagueScreen.jsx
git commit -m "feat: expand commissioner tour to 8 steps — full lifecycle guide"
```

---

## Task 6: Build verification + E2E smoke check

- [ ] **Step 1: Run production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` — no errors, no TDZ warnings. If a TDZ crash appears, check whether `TourReplayButton` is imported at two different depths (LeagueScreen → CommissionerPanel → TourReplayButton is fine; adding a second import path from LeagueScreen directly would cause TDZ).

- [ ] **Step 2: Run E2E smoke test**

```bash
npx playwright test e2e/tests/platform.spec.js --reporter=line 2>&1 | tail -10
```

Expected: all 36 tests pass across 2 browsers.

- [ ] **Step 3: Create feature branch PR and merge**

```bash
git checkout -b claude/commissioner-tour-guide
# cherry-pick or rebase the 5 commits from main if working on a branch
# OR if already on main (direct commits), just push:
git push origin main
```

If working on a feature branch:
```bash
git push origin claude/commissioner-tour-guide
# Merge via squash (no gh CLI):
git checkout main
git merge --squash claude/commissioner-tour-guide
git commit -m "feat: commissioner guide — TourReplayButton + 8-step lifecycle tour"
git push origin main
git branch -D claude/commissioner-tour-guide
git push origin --delete claude/commissioner-tour-guide
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Replay button redesigned (Task 1 — `TourReplayButton` with gold accent, branded typography)
- ✅ Replay button shared between CommissionerPanel and BetsTabHub (Tasks 2 + 4)
- ✅ Button is wired in both mobile and desktop layouts of CommissionerPanel (Task 4)
- ✅ `data-tour` anchors added to all 8 zones (Task 3)
- ✅ Tour expanded from 4 → 8 steps covering full lifecycle (Task 5)
- ✅ Tour covers: season overview → transfers → draft → cup → scoring → bets → resolve → weekly flow
- ✅ Build and E2E verification (Task 6)
- ✅ TDZ safety: `TourReplayButton` imported by `CommissionerPanel` and `BetsTabHub` — neither is imported by the other, so no circular depth issue. `LeagueScreen` does not import `TourReplayButton` directly.

**Placeholder scan:** No TBDs, no "fill in details", all code complete.

**Type/name consistency:**
- `replayCommissionerTour` — consistent across `useOnboarding.js` return, `LeagueScreen` prop pass, `CommissionerPanel` signature
- `data-tour` values — consistent between Task 3 (attributes) and Task 5 (step targets)
- `TourReplayButton` import path from `CommissionerPanel`: `'../TourReplayButton'` (CommissionerPanel lives in `src/components/league/`, TourReplayButton in `src/components/`) ✅
- `TourReplayButton` import path from `BetsTabHub`: `'../TourReplayButton'` (same directory relationship) ✅
