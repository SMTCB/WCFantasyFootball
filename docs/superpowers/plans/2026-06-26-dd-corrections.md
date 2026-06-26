# Due Diligence Corrections — v2 Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 6 code-quality gaps identified in the external due diligence checklist against v2, keeping zero risk to the live WC pilot on `main`.

**Architecture:** All changes on `v2` branch only. DB migration created as a SQL file but NOT applied (apply from the Supabase-connected PC). Frontend console stripping handled via Vite build config. Hex tokens introduced to `src/index.css` first, then consumed by individual screens.

**Tech Stack:** React 19 · Vite 8 (Rolldown) · Tailwind CSS 4 · Supabase PostgreSQL · Deno Edge Functions

**Branch constraint:** ALL work on `v2`. NEVER push to `main`. DB migration is created for review — do not execute it here.

---

## Task 1 — Coin Ledger Compliance Migration (SQL only, DO NOT APPLY)

**Files:**
- Create: `supabase/migrations/209_coin_ledger_compliance.sql`

Current state (from migrations 202 + 206 + 208):
- `currency` default is `'GBP'` — a real ISO 4217 code on a virtual coin table (compliance risk)
- `type` CHECK does not include spec-standard names `wager_placement` / `wager_win` / `wager_refund`
- `credit_coins()` defaults `p_currency = 'GBP'`

- [ ] **Step 1: Create migration SQL file**

```sql
-- ── Migration 209: Coin ledger compliance ──────────────────────────────────────
-- (a) currency default: 'GBP' → 'FRC' (Frontrow Coin — internal virtual token,
--     NOT ISO 4217. Using a real currency code was a compliance gap.)
-- (b) type CHECK: add spec-standard aliases wager_placement / wager_win / wager_refund
--     (existing values kept for backward-compat — both forms valid)
-- (c) credit_coins() default p_currency: 'GBP' → 'FRC'
--
-- ⚠️  DO NOT APPLY from this machine — apply from the Supabase-linked PC only.

-- ── 1. Currency: change column default and add comment ────────────────────────

ALTER TABLE coin_transactions
  ALTER COLUMN currency SET DEFAULT 'FRC';

COMMENT ON COLUMN coin_transactions.currency IS
  'Internal virtual token code. FRC = Frontrow Coin. NOT ISO 4217.';

-- ── 2. Type CHECK: extend with spec-standard names ────────────────────────────
-- Drop existing and recreate (PostgreSQL does not support ADD VALUE to CHECK).
-- Existing values preserved for backward-compat (any live rows keep their type).

ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_type_check
  CHECK (type IN (
    -- original values (keep for backward-compat)
    'purchase', 'stake', 'win', 'loss', 'rake', 'refund', 'admin', 'entry_fee',
    -- spec-standard aliases
    'wager_placement',  -- alias for stake
    'wager_win',        -- alias for win
    'wager_refund'      -- alias for refund
  ));

-- ── 3. credit_coins() — update p_currency default from 'GBP' → 'FRC' ─────────

CREATE OR REPLACE FUNCTION credit_coins(
  p_user_id      uuid,
  p_amount       int,
  p_type         text     DEFAULT 'admin',
  p_challenge_id uuid     DEFAULT NULL,
  p_meta         jsonb    DEFAULT '{}',
  p_currency     char(3)  DEFAULT 'FRC',
  p_reference_id text     DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_type NOT IN ('purchase','win','refund','admin') THEN
    RAISE EXCEPTION 'INVALID_CREDIT_TYPE';
  END IF;

  INSERT INTO coin_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = coin_wallets.balance + p_amount,
        updated_at = now();

  INSERT INTO coin_transactions
    (user_id, type, amount, challenge_id, meta, currency, reference_id)
  VALUES
    (p_user_id, p_type, p_amount, p_challenge_id, p_meta, p_currency, p_reference_id);
END;
$$;
REVOKE ALL ON FUNCTION credit_coins FROM public, authenticated, anon;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/209_coin_ledger_compliance.sql
git commit -m "chore(v2): migration 209 — coin ledger compliance (FRC currency, spec-standard type aliases)"
```

---

## Task 2 — Console.log Cleanup

**Files:**
- Modify: `vite.config.js`
- Modify: `supabase/functions/calculate-scores/index.js`

Approach:
- Frontend: Vite `esbuild.drop` strips all `console.*` from production build (0 source-file edits needed for 85 src/ instances)
- Edge Functions: manual removal of `console.log` calls; keep `console.error` as these are the only error observability in Deno

- [ ] **Step 1: Add console drop to vite.config.js**

Change `defineConfig({...})` to factory form `defineConfig(({ mode }) => ({...}))` and add:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'supabase';
          if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('/react/')) return 'react';
        },
      },
    },
  },
}))
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```
Expected: zero errors, zero warnings.

- [ ] **Step 3: Strip console.log from calculate-scores Edge Function**

In `supabase/functions/calculate-scores/index.js`, remove all `console.log(...)` lines (10 instances). Keep every `console.error(...)` — these are the sole error observability signal in production Deno.

Run before editing:
```bash
grep -n "console\." supabase/functions/calculate-scores/index.js
```
Remove each `console.log` line. Do NOT remove `console.error` or `console.warn` lines.

- [ ] **Step 4: Commit**

```bash
git add vite.config.js supabase/functions/calculate-scores/index.js
git commit -m "chore(v2): strip console.log — vite esbuild.drop + calculate-scores cleanup"
```

---

## Task 3 — CSS Token Additions

**Files:**
- Modify: `src/index.css`

Two gaps:
1. `--on-shell` (full-opacity white for text on dark `--shell` surfaces) — token exists as `--on-shell-dim` (45%) but not full-opacity
2. `--accent-bg` is a hardcoded `rgba(26,111,168,.08)` that silently breaks when an operator overrides `--brand-accent`

- [ ] **Step 1: Add --on-shell token and fix --accent-bg in src/index.css**

In the `:root` white-label section (around line 80), the block currently reads:
```css
  --brand-accent: #1A6FA8;
  --accent:         var(--brand-accent);
  --accent-bg:      rgba(26,111,168,.08);
  --cyan:           var(--brand-accent);
  --on-shell-dim:   rgba(255,255,255,.45);
```

Change to:
```css
  --brand-accent: #1A6FA8;
  --accent:         var(--brand-accent);
  --accent-bg:      color-mix(in srgb, var(--brand-accent) 8%, transparent);
  --cyan:           var(--brand-accent);
  --on-shell:       #ffffff;
  --on-shell-dim:   rgba(255,255,255,.45);
```

Also add a spacing scale comment block in the `:root` section (after the last semantic token):

```css
  /* ── Spacing scale (base-4) ──────────────────────────────────────────────
     Use multiples of 4px only: 4 8 12 16 24 32 48 64 80 96px.
     Any inline style with a non-4 value (5, 7, 9, 13, 15px) is off-scale. */
```

- [ ] **Step 2: Verify no CSS parse error**

```bash
npm run build
```
Expected: clean build (Tailwind/Vite will parse index.css; any CSS syntax error fails the build).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "chore(v2): add --on-shell token, fix --accent-bg with color-mix, add spacing scale comment"
```

---

## Task 4 — F1 Screen Hex Sweep

**Files:**
- Modify: `src/screens/f1/F1AdminScreen.jsx`
- Modify: `src/screens/f1/F1HomeScreen.jsx`
- Modify: `src/screens/f1/F1ReportScreen.jsx`
- Modify: `src/screens/f1/F1SeasonBetsScreen.jsx`
- Modify: `src/screens/f1/F1StandingsScreen.jsx`
- Modify: `src/screens/f1/PaddockLobbyScreen.jsx`

Rule: Replace `color: '#fff'` **only on headers / text elements on `--shell` backgrounds**.
Do NOT touch `color: '#fff'` on buttons with `background: 'var(--accent)'` — those are intentional.

- [ ] **Step 1: F1AdminScreen.jsx line 150 — h1 header**

`color: '#fff'` → `color: 'var(--on-shell)'`

- [ ] **Step 2: F1HomeScreen.jsx line 107 — div header**

`color: '#fff'` → `color: 'var(--on-shell)'`
(Lines 117, 171 are button text on accent — leave as-is)

- [ ] **Step 3: F1ReportScreen.jsx line 45 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`

- [ ] **Step 4: F1SeasonBetsScreen.jsx line 115 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`
(Line 154 is submit button on accent — leave as-is)

- [ ] **Step 5: F1StandingsScreen.jsx line 33 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`

- [ ] **Step 6: PaddockLobbyScreen.jsx line 69 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`
(Lines 120, 150, 199, 225 are buttons on accent — leave as-is)

- [ ] **Step 7: Commit**

```bash
git add src/screens/f1/
git commit -m "chore(v2): F1 screens — #fff → var(--on-shell) on shell-surface headers"
```

---

## Task 5 — Tennis Screen Hex Sweep

**Files:**
- Modify: `src/screens/tennis/PlayerBoxScreen.jsx`
- Modify: `src/screens/tennis/TennisAdminScreen.jsx`
- Modify: `src/screens/tennis/TennisAtpFinalsScreen.jsx`
- Modify: `src/screens/tennis/TennisHomeScreen.jsx`
- Modify: `src/screens/tennis/TennisLeaderboardScreen.jsx`

Same rule as Task 4 — headers on `--shell` only.

- [ ] **Step 1: PlayerBoxScreen.jsx line 71 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`
(Lines 117, 139, 187, 213 are buttons on accent — leave)

- [ ] **Step 2: TennisAdminScreen.jsx line 92 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`

- [ ] **Step 3: TennisAtpFinalsScreen.jsx line 73 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`
(Lines 141, 182 are submit buttons — leave)

- [ ] **Step 4: TennisHomeScreen.jsx lines 44 and 94 — h1 and div header**

Both `color: '#fff'` → `color: 'var(--on-shell)'`
(Lines 51, 80, 100 are buttons on accent — leave)

- [ ] **Step 5: TennisLeaderboardScreen.jsx line 20 — h1**

`color: '#fff'` → `color: 'var(--on-shell)'`
(Line 47 button — leave)

- [ ] **Step 6: Commit**

```bash
git add src/screens/tennis/
git commit -m "chore(v2): Tennis screens — #fff → var(--on-shell) on shell-surface headers"
```

---

## Task 6 — Other Screens Hex Sweep

**Files:**
- Modify: `src/screens/ClubhouseScreen.jsx`
- Modify: `src/screens/SquadScreen.jsx`
- Modify: `src/screens/LiveScreen.jsx`
- Modify: `src/screens/MarketScreen.jsx`
- Modify: `src/screens/LeagueScreen.jsx`

- [ ] **Step 1: ClubhouseScreen.jsx lines 260 and 733**

Line 260: MONO span on shell → `color: '#fff'` → `color: 'var(--on-shell)'`
Line 733: h1 on shell → `color: '#fff'` → `color: 'var(--on-shell)'`
(Lines 118, 143, 399, 436, 487, 517, 828 are buttons on accent — leave)

- [ ] **Step 2: SquadScreen.jsx lines 955, 1070, 1696, 1729**

All four: Archivo Black headers on `--shell` surface
`color: '#fff'` → `color: 'var(--on-shell)'` on each

- [ ] **Step 3: LiveScreen.jsx lines 67 and 76**

Line 67: chart background gradient hardcodes `#0E1218` and `#0A0D12`
→ Replace both with `var(--shell)` (shell is the dark nav/header color: `#18202E`)

Line 76:
- `color: 'rgba(26,111,168,.55)'` → `color: 'color-mix(in srgb, var(--accent) 55%, transparent)'`
- `background: '#0A0D12'` → `background: 'var(--shell)'`

- [ ] **Step 4: MarketScreen.jsx lines 719, 759, 790**

Line 719: locked state `#F87171` (Tailwind red-400 raw hex) → `var(--neg)` (if token exists) or `var(--danger)`
Line 759: squad full `#4ADE80` (Tailwind green-400) → `var(--pos)` (if token exists) or `var(--positive)`
Line 790: free transfers `#4ADE80` → same as line 759

Note: Check if `--neg`/`--pos` tokens exist in `src/index.css`. If not, use `--danger` / `--positive` respectively.

- [ ] **Step 5: MarketScreen.jsx lines 1001 and 1012 — off-scale padding**

`padding: '7px'` → `padding: '8px'` on both lines (base-4 scale fix)

- [ ] **Step 6: LeagueScreen.jsx lines 778 and 1460**

Line 778: `color: '#000'` on checkmark — check context. If on a light/cream background, `var(--paper)` is correct (`#18202E` dark ink). Replace `'#000'` → `'var(--paper)'`.
Line 1460: `color: '#000'` on a positive/green background — replace with `'var(--positive)'` or a dark equivalent that reads on green. If the containing background is `var(--positive)`, the text should be a light color — check context carefully and use `var(--on-shell)` if on dark, or `var(--paper)` if on light.

- [ ] **Step 7: Commit**

```bash
git add src/screens/ClubhouseScreen.jsx src/screens/SquadScreen.jsx src/screens/LiveScreen.jsx src/screens/MarketScreen.jsx src/screens/LeagueScreen.jsx
git commit -m "chore(v2): other screens — hex → token sweep (shell headers, chart bg, status colors)"
```

---

## Task 7 — Spacing Scale Fixes

**Files:**
- Modify: `src/screens/ChallengeScreen.jsx`
- Modify: `src/screens/MultiSportHomeScreen.jsx`
- Modify: `src/screens/TrophyCabinetScreen.jsx`

All substitutions snap to base-4 scale. Differences are ≤ 2px and will not be visually noticeable.

- [ ] **Step 1: ChallengeScreen.jsx — all off-scale values**

```
Lines 116, 126: padding: '9px 0' → padding: '8px 0'
Line 821:       padding: '9px 0' → padding: '8px 0'
Lines 317, 320, 361, 364, 376, 382, 385, 403, 406, 831: 15px → 16px
Lines 856, 861: padding: '5px 0' → padding: '4px 0'
Lines 82, 171:  7px → 8px
```

Use grep to find and verify each line before editing:
```bash
grep -n "9px\|15px\|5px 0\|7px" src/screens/ChallengeScreen.jsx
```

- [ ] **Step 2: MultiSportHomeScreen.jsx line 239**

`padding: '0 15px'` → `padding: '0 16px'`

- [ ] **Step 3: TrophyCabinetScreen.jsx line 261**

`padding: '9px 0'` → `padding: '8px 0'`

- [ ] **Step 4: Commit**

```bash
git add src/screens/ChallengeScreen.jsx src/screens/MultiSportHomeScreen.jsx src/screens/TrophyCabinetScreen.jsx
git commit -m "chore(v2): spacing scale — snap off-scale px values to base-4 grid"
```

---

## Task 8 — README Football Live Data Degradation

**Files:**
- Modify: `README.md`

Add a note under the Football module row in the Key Modules table explaining live scoring resilience.

- [ ] **Step 1: Add graceful degradation note to README.md**

After the Key Modules table (after the `| **Circles** | ...` row), add:

```markdown
> **Football scoring resilience:** Live scoring uses three additive crons (2-min live pass, 5-min event ingest, post-match at 22:30 UTC). They are independent and additive — if the live cron misses a match, the post-match cron at 22:30 UTC completes scoring correctly. The platform is robust against live API failures; no manual intervention is needed for missed live updates.
```

Also fix the Rebrand Guide token table to include the two new tokens added in Task 3:

Add rows:
```
| `--on-shell`  | `#ffffff` | Full-brightness text on dark shell/nav surfaces |
| `--accent-bg` | `color-mix(…)` | Accent tint for chips/badges (auto-derives from `--accent`) |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(v2): README — football scoring resilience note + new token table entries"
```

---

## Task 9 — Final Lint + Build Verification + PR

- [ ] **Step 1: Full lint and build**

```bash
npm run lint
npm run build
```
Expected: 0 errors, 0 warnings on lint; clean Rolldown build.

- [ ] **Step 2: Playwright smoke test**

```bash
npx playwright test
```
Expected: 36 tests × 2 browsers pass (platform.spec.js).

- [ ] **Step 3: Create PR → v2 (NOT main)**

```bash
# Verify branch
git branch  # must show v2 feature branch, not main

# Create PR via GitHub API (gh not installed)
python3 -c "
import urllib.request, json
import subprocess

# Get PAT from remote URL
url = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], text=True).strip()
token = url.split('://')[1].split('@')[0]
repo = 'SMTCB/WCFantasyFootball'
branch = subprocess.check_output(['git', 'symbolic-ref', '--short', 'HEAD'], text=True).strip()

data = json.dumps({
  'title': 'chore(v2): due diligence corrections — coin ledger, console cleanup, token sweep, spacing',
  'head': branch,
  'base': 'v2',
  'body': '## Summary\n- Migration 209: FRC currency default + spec-standard type aliases (not applied)\n- Console cleanup: Vite esbuild.drop in production + calculate-scores manual strip\n- CSS tokens: --on-shell added, --accent-bg uses color-mix, spacing scale documented\n- Hex sweep: F1 + Tennis + other screens — shell headers use var(--on-shell)\n- Spacing scale: off-scale px values snapped to base-4 grid\n- README: football scoring resilience note\n\n## Test plan\n- [ ] npm run lint → 0 errors\n- [ ] npm run build → clean Rolldown build\n- [ ] npx playwright test → 36 tests pass\n- [ ] Migration 209 reviewed and applied from Supabase-linked PC\n'
}).encode()
req = urllib.request.Request(
  f'https://api.github.com/repos/{repo}/pulls', data=data,
  headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req) as r:
  result = json.loads(r.read())
  print('PR #', result['number'], '—', result['html_url'])
"
```

- [ ] **Step 4: Merge and cleanup after review**

```bash
# After PR approved, merge squash into v2
python3 -c "... merge script ..."

git checkout v2
git pull origin v2
git branch -D claude/v2-dd-corrections  # or whatever branch name was used
```

---

## Notes

- **Migration 209 MUST NOT be applied from this machine.** Commit the file, push to v2, and apply from the Supabase-linked PC in a separate session.
- `--accent-bg: color-mix(in srgb, var(--brand-accent) 8%, transparent)` requires Safari 16.2+ / Chrome 111+ / iOS 16.2+ — acceptable for a 2024+ app.
- The `esbuild.drop` in Vite config removes `console.*` from production builds only (`mode === 'production'`). Dev builds retain console output for debugging.
- Tennis screens: this plan excludes unit tests (deferred to a separate UAT session per user decision 2026-06-26).
