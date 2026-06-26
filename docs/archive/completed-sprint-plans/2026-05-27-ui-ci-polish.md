# UI & CI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining deferred items from the sprint plan — CI now tests the production bundle, html2canvas replaced with modern-screenshot, and 7 visible UI rough edges cleaned up.

**Architecture:** All changes are surgical edits to existing files. No new DB migrations needed. No new components. The html2canvas swap is a drop-in replacement using `modern-screenshot`'s `domToPng` API which returns a data URL directly. The UI fixes are all one- or two-line changes in existing components. Note: U84 (activity filter chips) was already fixed — the chips ARE `<button>` elements with live `onClick` handlers.

**Tech Stack:** React 19, Vite v8/Rolldown, Supabase JS v2, Playwright, GitHub Actions, `modern-screenshot` (new dep).

---

## File Map

| File | Change |
|------|--------|
| `playwright.config.js` | webServer uses `npm run build && npm run preview` (DEPLOY-2) |
| `src/components/LeagueInviteCard.jsx` | Replace html2canvas with modern-screenshot (LOW-4 / U92) |
| `src/screens/RecapScreen.jsx` | Replace html2canvas + add `is_triple_captain` to squad select + pass `isTripleCap` in recap (LOW-4, U105) |
| `src/components/RecapCard.jsx` | Remove misleading `transfersMade` stat (U98) |
| `src/components/league/LeagueDetailView.jsx` | Remove dead MD column + hardcoded TrendPill(0) (U82/U83) |
| `src/components/AuctionCard.jsx` | Add confirm state before calling `onCancel` (U88) |
| `src/screens/LeagueScreen.jsx` | Disable `+ INVITE` button until `join_code` is loaded (U93) |
| `src/screens/LiveScreen.jsx` | Add `visibilitychange` listener to refresh on tab focus (U101) |
| `docs/BUG_TRACKER.md` | Mark U82/U83/U84(already done)/U88/U92/U93/U98/U101/U105 fixed |
| `HANDOFF_PROMPT.md` | Update session number and no-open-bugs note |

---

## Task 1 — DEPLOY-2: CI E2E runs against production bundle

**Files:**
- Modify: `playwright.config.js` line 43

The current webServer command starts Vite dev server (`npm run dev`). Rolldown TDZ bugs only appear in the minified production bundle — CI currently can't catch them.

- [ ] **Step 1: Change the webServer command**

  In `playwright.config.js`, find:
  ```js
  command: 'npm run dev -- --port 5174',
  url: 'http://localhost:5174',
  reuseExistingServer: !isCI,   // Always start fresh on CI
  timeout: isCI ? 60000 : 30000,
  ```

  Replace with:
  ```js
  command: 'npm run build && npm run preview -- --port 5174',
  url: 'http://localhost:5174',
  reuseExistingServer: !isCI,
  timeout: isCI ? 120000 : 60000,
  ```

  The timeout is increased because `npm run build` adds ~30s on CI VMs. `npm run preview` is already in `package.json` as `"preview": "vite preview"`.

- [ ] **Step 2: Run build to confirm the build still works**

  ```bash
  npm run build
  ```
  Expected: `✓ built in <Xs>` with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add playwright.config.js
  git commit -m "ci: E2E runs against production bundle — DEPLOY-2"
  ```

---

## Task 2 — LOW-4 / U92: Replace html2canvas with modern-screenshot

**Files:**
- Modify: `src/components/LeagueInviteCard.jsx`
- Modify: `src/screens/RecapScreen.jsx`

`html2canvas` does not resolve CSS variables — the invite card PNG has a transparent background (U92). `modern-screenshot`'s `domToPng` uses `foreignObject` rendering which resolves CSS vars correctly and is actively maintained. It returns a data URL directly (no `.toDataURL()` call needed).

- [ ] **Step 1: Install modern-screenshot and remove html2canvas**

  ```bash
  npm install modern-screenshot
  npm uninstall html2canvas
  ```

  Expected: `package.json` has `"modern-screenshot"` added and `"html2canvas"` removed.

- [ ] **Step 2: Update `LeagueInviteCard.jsx`**

  Find line 17:
  ```js
  import html2canvas from 'html2canvas';
  ```
  Replace with:
  ```js
  import { domToPng } from 'modern-screenshot';
  ```

  Find the `exportImage` function (lines ~66–84):
  ```js
  const exportImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: 'var(--ink-2)',
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${league.name.replace(/\s+/g, '-')}-invite.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };
  ```

  Replace with:
  ```js
  const exportImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await domToPng(cardRef.current, {
        scale: 2,
        backgroundColor: '#0F1218',   // --ink-2 resolved value
      });
      const link = document.createElement('a');
      link.download = `${league.name.replace(/\s+/g, '-')}-invite.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };
  ```

- [ ] **Step 3: Update `RecapScreen.jsx`**

  Find line 3:
  ```js
  import html2canvas from 'html2canvas';
  ```
  Replace with:
  ```js
  import { domToPng } from 'modern-screenshot';
  ```

  Find the `generateImage` function (lines ~228–242):
  ```js
  const generateImage = async () => {
    if (!cardRef.current) return null;
    setSharing(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: '#0D0D0D',
        useCORS: true,
        logging: false,
      });
      return canvas.toDataURL('image/png');
    } finally {
      setSharing(false);
    }
  };
  ```

  Replace with:
  ```js
  const generateImage = async () => {
    if (!cardRef.current) return null;
    setSharing(true);
    try {
      return await domToPng(cardRef.current, {
        scale: 3,
        backgroundColor: '#0D0D0D',
      });
    } finally {
      setSharing(false);
    }
  };
  ```

- [ ] **Step 4: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors, clean build.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/LeagueInviteCard.jsx src/screens/RecapScreen.jsx package.json package-lock.json
  git commit -m "fix: replace html2canvas with modern-screenshot — LOW-4, U92"
  ```

---

## Task 3 — U82/U83: Remove dead MD column and hardcoded TrendPill from standings

**Files:**
- Modify: `src/components/league/LeagueDetailView.jsx`

The standings table has 5 columns: `# | MANAGER | MD | TOT | actions`. The MD (matchday points) column always shows `—` — there's no data source for last-round points. `TrendPill` is called with `trend={0}` hardcoded, so it always shows `=`. Both are misleading. Remove them.

- [ ] **Step 1: Remove MD column from header**

  Find (line ~143–146):
  ```jsx
  <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 80px 80px 100px', gap: 14, padding: '12px 24px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)' }}>
    {['#', 'MANAGER', 'MD', 'TOT', ''].map((h, i) => (
      <div key={i} style={{ fontFamily: MONO, fontSize: 9, textAlign: i >= 2 && i < 4 ? 'right' : 'left' }}>{h}</div>
    ))}
  </div>
  ```

  Replace with:
  ```jsx
  <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 80px 100px', gap: 14, padding: '12px 24px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)' }}>
    {['#', 'MANAGER', 'TOT', ''].map((h, i) => (
      <div key={i} style={{ fontFamily: MONO, fontSize: 9, textAlign: i >= 2 && i < 3 ? 'right' : 'left' }}>{h}</div>
    ))}
  </div>
  ```

- [ ] **Step 2: Update each data row — remove MD cell and TrendPill, fix grid**

  Find (line ~158–188):
  ```jsx
  <div key={m.user_id} style={{
    display: 'grid', gridTemplateColumns: '48px 1fr 80px 80px 100px', gap: 14, alignItems: 'center',
    ...
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 14, minWidth: 18 }}>{m.rank || '—'}</span>
      <TrendPill trend={0} />
    </div>
    ...
    <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13, color: 'var(--mute)' }}>—</div>
    <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13 }}>{m.total_points}</div>
  ```

  Replace the opening grid div and rank cell:
  ```jsx
  <div key={m.user_id} style={{
    display: 'grid', gridTemplateColumns: '48px 1fr 80px 100px', gap: 14, alignItems: 'center',
    padding: '12px 24px', borderBottom: '1px solid var(--rule)',
    borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent',
    background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 14, minWidth: 18 }}>{m.rank || '—'}</span>
    </div>
  ```

  And remove the `<div>—</div>` MD data cell (the one with `color: 'var(--mute)'` showing `—`).

  The `<div>{m.total_points}</div>` TOT cell and the actions cell remain unchanged.

- [ ] **Step 3: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors. Verify `TrendPill` is no longer imported if it's not used elsewhere — if it IS used elsewhere, leave the import.

  Check:
  ```bash
  grep -n "TrendPill" src/components/league/LeagueDetailView.jsx
  ```
  If zero results, also remove `TrendPill` from the import line at the top of the file.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/league/LeagueDetailView.jsx
  git commit -m "fix: remove dead MD standings column and hardcoded TrendPill — U82/U83"
  ```

---

## Task 4 — U88: AuctionCard cancel requires confirmation

**Files:**
- Modify: `src/components/AuctionCard.jsx`

The Cancel button immediately calls `onCancel` with no confirmation — one tap destroys the listing and all bids. Add a two-step confirm: first tap changes button to "Confirm Cancel?", second tap within 4s fires the actual cancel. If the user doesn't confirm within 4s, it resets.

- [ ] **Step 1: Add confirm state**

  In `AuctionCard.jsx`, find the component's state declarations (near the top of the function body). Add:
  ```js
  const [confirmCancel, setConfirmCancel] = useState(false);
  ```
  (The existing `useState` import is already there.)

- [ ] **Step 2: Replace the Cancel button**

  Find (lines ~104–111):
  ```jsx
  <button
    onClick={async () => { setBusy(true); const r = await onCancel(auction.id); setBusy(false); if (!r.ok) setErr(r.error); }}
    disabled={busy}
    className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 disabled:opacity-40"
    style={{ border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', background: 'rgba(239,68,68,0.06)' }}
  >
    {busy ? '…' : 'Cancel'}
  </button>
  ```

  Replace with:
  ```jsx
  <button
    onClick={async () => {
      if (!confirmCancel) {
        setConfirmCancel(true);
        setTimeout(() => setConfirmCancel(false), 4000);
        return;
      }
      setBusy(true);
      setConfirmCancel(false);
      const r = await onCancel(auction.id);
      setBusy(false);
      if (!r.ok) setErr(r.error);
    }}
    disabled={busy}
    className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 disabled:opacity-40"
    style={{
      border: `1px solid ${confirmCancel ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.3)'}`,
      color: 'var(--danger)',
      background: confirmCancel ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.06)',
    }}
  >
    {busy ? '…' : confirmCancel ? 'Confirm Cancel?' : 'Cancel'}
  </button>
  ```

- [ ] **Step 3: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors, clean build.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/AuctionCard.jsx
  git commit -m "fix: auction cancel requires confirmation tap — U88"
  ```

---

## Task 5 — U93: Invite button disabled until join_code is loaded

**Files:**
- Modify: `src/screens/LeagueScreen.jsx`

The `+ INVITE` button calls `setNewLeague(activeLeague?.leagues || activeLeague)`. If `loadLeagueById` hasn't completed yet, `activeLeague` may not have `join_code` populated, so `LeagueInviteCard` renders `undefined` in the invite URL. Fix: disable the button until `join_code` is truthy.

The `activeLeague` object shape: when populated from `useLeague` hook, the league's `join_code` is at `activeLeague.leagues?.join_code` or `activeLeague.join_code` (depends on which shape is resolved). Check by grepping for where `join_code` is read from `activeLeague`.

- [ ] **Step 1: Find the join_code field path**

  ```bash
  grep -n "join_code" src/screens/LeagueScreen.jsx | head -10
  ```

  This will show whether `join_code` is at `activeLeague.join_code` or `activeLeague.leagues.join_code`.

- [ ] **Step 2: Add disabled guard to both INVITE buttons**

  There are two `+ INVITE` buttons (desktop ~line 718 and mobile ~line 752). For each, determine the `join_code` path from Step 1 and add `disabled` + reduced opacity when not yet loaded.

  For each button, add:
  ```jsx
  disabled={!activeLeague?.leagues?.join_code && !activeLeague?.join_code}
  style={{
    ...existing style...,
    opacity: (!activeLeague?.leagues?.join_code && !activeLeague?.join_code) ? 0.4 : 1,
    cursor: (!activeLeague?.leagues?.join_code && !activeLeague?.join_code) ? 'default' : 'pointer',
  }}
  ```

  Simplify by computing the value once before the JSX:
  ```js
  const joinCode = activeLeague?.leagues?.join_code ?? activeLeague?.join_code ?? null;
  ```
  Then use `disabled={!joinCode}` and `opacity: joinCode ? 1 : 0.4`.

- [ ] **Step 3: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors. Check TDZ rule: `LeagueScreen.jsx` is a large component — do not add any new module imports. The `joinCode` computation is pure JS, no imports needed.

- [ ] **Step 4: Commit**

  ```bash
  git add src/screens/LeagueScreen.jsx
  git commit -m "fix: disable invite button until join_code is loaded — U93"
  ```

---

## Task 6 — U98: Remove misleading transfersMade=0 from RecapCard

**Files:**
- Modify: `src/screens/RecapScreen.jsx`
- Modify: `src/components/RecapCard.jsx`

`RecapScreen` hardcodes `transfersMade: 0` because transfer history isn't tracked yet. `RecapCard` renders this as a visible stat that looks like a bug to users. Remove it from both files until transfer tracking is implemented.

- [ ] **Step 1: Remove from RecapScreen**

  Find (line ~195):
  ```js
  transfersMade: 0,    // transfer log not yet tracked
  ```

  Delete that line.

- [ ] **Step 2: Remove from RecapCard**

  In `RecapCard.jsx`, find the destructuring (lines ~9–21):
  ```js
  const {
    ...
    transfersMade,
    ...
  } = recap;
  ```
  Remove `transfersMade,` from the destructuring.

  Then find the JSX that renders it (line ~131):
  ```jsx
  <div style={{ fontSize: '13px', fontWeight: 700 }}>{transfersMade}</div>
  ```
  Find and remove the entire stat block containing `transfersMade` (typically a row with a label "Transfers" and the value). Read the surrounding context (~5 lines above and below line 131) to identify the full block to remove.

- [ ] **Step 3: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/screens/RecapScreen.jsx src/components/RecapCard.jsx
  git commit -m "fix: remove misleading transfersMade=0 stat from RecapCard — U98"
  ```

---

## Task 7 — U101: LiveScreen refreshes when tab regains focus

**Files:**
- Modify: `src/screens/LiveScreen.jsx`

LiveScreen polls `fetchAll` every `REFRESH_MS` (60s). If the user backgrounds the tab for 10+ minutes, the content is stale with no auto-recovery. Adding a `visibilitychange` listener triggers an immediate refresh when the tab becomes visible again.

- [ ] **Step 1: Find the existing useEffects at the bottom of LiveScreen**

  ```bash
  grep -n "useEffect\|visibilitychange\|fetchAll" src/screens/LiveScreen.jsx | tail -20
  ```

  Find the main effect that starts the polling interval (lines ~568–572):
  ```js
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_MS);
    ...
  }, [fetchAll]);
  ```

- [ ] **Step 2: Add the visibilitychange effect after the existing polling effect**

  Add immediately after the interval effect (after its closing `}, [fetchAll]);`):
  ```js
  // U101: refresh immediately when user returns to this tab after backgrounding
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchAll]);
  ```

- [ ] **Step 3: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors, clean build.

- [ ] **Step 4: Commit**

  ```bash
  git add src/screens/LiveScreen.jsx
  git commit -m "fix: LiveScreen refreshes when tab regains focus — U101"
  ```

---

## Task 8 — U105: Triple Captain badge shows ×3 not ×2

**Files:**
- Modify: `src/screens/RecapScreen.jsx`

The squad query in `fetchRecap` does not select `is_triple_captain`, so the captain badge always shows `×2` even when the Triple Captain chip was used. Fix: add `is_triple_captain` to the squad select and include it in the recap object.

- [ ] **Step 1: Add `is_triple_captain` to the squad SELECT**

  In `RecapScreen.jsx`, find (line ~85–90):
  ```js
  let squadQuery = supabase.from('squads')
    .select('id, matchday_id, players, captain_id, joker_player_id')
  ```

  Replace with:
  ```js
  let squadQuery = supabase.from('squads')
    .select('id, matchday_id, players, captain_id, joker_player_id, is_triple_captain')
  ```

- [ ] **Step 2: Pass `isTripleCap` into the recap object**

  Find (line ~152 — the comment about triple-cap):
  ```js
  // Captain × 2 (or × 3 for triple-cap, not tracked here); Joker player × 2.
  ```

  Update the comment:
  ```js
  // Captain × 2 (or × 3 for triple-cap chip); Joker player × 2.
  ```

  Then find where the `recap` object is assembled (look for `setRecap({` or the recap object literal). Add `isTripleCap: squadRow?.is_triple_captain ?? false` to it:
  ```js
  setRecap({
    ...existingFields,
    isTripleCap: squadRow?.is_triple_captain ?? false,
  });
  ```

- [ ] **Step 3: Update the badge in the JSX**

  Find (lines ~425–429):
  ```jsx
  <div className="bg-yellow-500 text-black text-[11px] font-black px-2.5 py-1 rounded-[3px]">
    {recap.captain.points != null
      ? `×2 = ${recap.captain.points * 2} pts`
      : '×2'}
  </div>
  ```

  Replace with:
  ```jsx
  <div className="bg-yellow-500 text-black text-[11px] font-black px-2.5 py-1 rounded-[3px]">
    {recap.captain.points != null
      ? `×${recap.isTripleCap ? 3 : 2} = ${recap.captain.points * (recap.isTripleCap ? 3 : 2)} pts`
      : recap.isTripleCap ? '×3' : '×2'}
  </div>
  ```

- [ ] **Step 4: Run lint and build**

  ```bash
  npm run lint
  npm run build
  ```
  Expected: 0 errors, clean build.

- [ ] **Step 5: Commit**

  ```bash
  git add src/screens/RecapScreen.jsx
  git commit -m "fix: Triple Captain badge shows ×3 when chip was used — U105"
  ```

---

## Task 9 — Update docs and create PR

- [ ] **Step 1: Update `docs/BUG_TRACKER.md`**

  This file tracks sprint plan items, not just bugs. Add a new section at the bottom or update any existing entries for the items addressed:

  Add to the Summary Table (or create a new "Sprint Plan Deferred Items — Fixed" section):
  ```
  | DEPLOY-2 | CI E2E runs against production bundle | 🟡 | ✅ Fixed | #current-PR |
  | LOW-4/U92 | html2canvas replaced with modern-screenshot; invite card PNG bg fixed | 🟡 | ✅ Fixed | #current-PR |
  | U82/U83 | Standings dead MD column + hardcoded TrendPill removed | 🟢 | ✅ Fixed | #current-PR |
  | U88 | AuctionCard cancel requires confirmation | 🟢 | ✅ Fixed | #current-PR |
  | U93 | Invite button disabled until join_code loaded | 🟢 | ✅ Fixed | #current-PR |
  | U98 | RecapCard misleading transfersMade=0 removed | 🟢 | ✅ Fixed | #current-PR |
  | U101 | LiveScreen refreshes on tab focus | 🟢 | ✅ Fixed | #current-PR |
  | U105 | Triple Captain badge shows ×3 | 🟢 | ✅ Fixed | #current-PR |
  | U84 | Activity filter chips — already fixed (buttons, not spans) | — | ✅ N/A | — |
  | LOW-8 | players.id BIGINT issue — already resolved by migration 78 | — | ✅ N/A | — |
  ```

- [ ] **Step 2: Update `HANDOFF_PROMPT.md`**

  Change the "Current state" date to `2026-05-27 (session 47)`.
  Add to the "What was recently done" section:
  ```
  - Session 47: CI now tests production bundle (DEPLOY-2); html2canvas replaced (LOW-4/U92); 
    standings cleaned up (U82/U83); auction cancel confirmation (U88); invite guard (U93); 
    RecapCard cleanup (U98); LiveScreen tab focus (U101); Triple Captain ×3 badge (U105)
  ```

- [ ] **Step 3: Commit docs**

  ```bash
  git add docs/BUG_TRACKER.md HANDOFF_PROMPT.md
  git commit -m "docs: update BUG_TRACKER and HANDOFF for session 47 fixes"
  ```

- [ ] **Step 4: Push branch and create PR via GitHub API**

  ```bash
  git push origin <current-branch>
  ```

  Then create PR via GitHub REST API (gh CLI not available):
  ```bash
  TOKEN=$(git remote get-url origin | grep -oP 'ghp_[^@]+')
  curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    https://api.github.com/repos/SMTCB/WCFantasyFootball/pulls \
    --data-binary @- <<'EOF'
  {"title":"fix: CI prod bundle, html2canvas→modern-screenshot, standings/auction/recap/live polish","head":"<branch-name>","base":"main","body":"Session 47 — deferred sprint plan items:\n\n- DEPLOY-2: E2E now runs against production Vite build\n- LOW-4/U92: html2canvas replaced with modern-screenshot (invite PNG bg fixed)\n- U82/U83: Dead MD column + hardcoded TrendPill removed from standings\n- U88: Auction cancel requires confirmation tap\n- U93: Invite button disabled until join_code is loaded\n- U98: Misleading transfersMade=0 removed from RecapCard\n- U101: LiveScreen refreshes when tab regains focus\n- U105: Triple Captain badge shows ×3\n\nGenerated with Claude Code"}
  EOF
  ```

  After getting the PR number, squash merge and delete branch:
  ```bash
  # Squash merge
  curl -s -X PUT \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    https://api.github.com/repos/SMTCB/WCFantasyFootball/pulls/<PR_NUMBER>/merge \
    --data-binary @- <<'EOF'
  {"merge_method":"squash","commit_title":"fix: CI prod bundle, modern-screenshot, standings/auction/recap/live polish (#<PR_NUMBER>)"}
  EOF

  # Delete remote branch
  curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/SMTCB/WCFantasyFootball/git/refs/heads/<branch-name>

  # Pull and clean local
  git checkout main && git pull origin main && git branch -D <branch-name>
  ```
