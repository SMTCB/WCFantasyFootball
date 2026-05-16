# UX/UI Review — Forza Fantasy League

**Date:** 2026-05-16
**Methodology:** Live dev server inspection (DOM, computed styles, viewport tests) + code-level audit per [docs/UX_UI_REVIEW_GUIDE.md](./UX_UI_REVIEW_GUIDE.md)
**Scope:** 11 screens, 8 user journeys, desktop (1280px) + mobile (375px)
**Tools:** preview_eval / preview_resize / preview_snapshot, Explore agent

---

## 1. Executive Summary

| Dimension | Score | Verdict |
|---|---|---|
| UX (flow, clarity, feedback) | **6.4 / 10** | Functional but friction-heavy |
| UI (consistency, polish, design system) | **5.5 / 10** | Tokens exist but bypassed often |
| Accessibility (WCAG) | **3.2 / 10** | Critical — keyboard users effectively locked out |
| **Overall weighted** | **6.0 / 10** | Fair — solid foundation, real friction blocking the next level |

The app is **feature-complete** (37/37 core features per BACKLOG.md, 178/178 E2E passing). Friction is **not in functionality** — it's in **visual cohesion, accessibility, and onboarding flow**. The most expensive issues to ignore are the cheapest to fix.

### Top 5 highest-ROI fixes

1. Centralized `<Button>` component — kills duplication of ~15+ inline button styles and unblocks every future style fix.
2. Visible focus outlines on all interactive elements — currently overridden by inline button styles site-wide. One CSS rule unlocks WCAG 2.1.
3. Fix the two-cyan bug (auth screen uses `#00C4E8` and `#00B4D8` side-by-side). 5-minute fix, big perceived-quality win.
4. Replace text spinners with skeleton placeholders on Squad/Market/Live/League. Lifts perceived speed dramatically.
5. Make onboarding tours opt-in, not auto-trigger — currently blocks the first user action on Squad and Market every session.

---

## 2. Journey-by-Journey Assessment

| # | Journey | Score | Verdict | Top friction |
|---|---|---|---|---|
| 1 | Onboarding → Home | 6 / 10 | Tour blocks app on every visit until dismissed; "Skip intro" is 59×17px (un-tappable on mobile) | Mandatory wizard overlay shown to authenticated returning users |
| 2 | Squad Building | 6 / 10 | Forced 4-step tour ("1/4") covers the actual squad | Tour cannot be dismissed in one click; tabs are 94×34px (sub-44px) |
| 3 | League Creation | 7 / 10 | Empty state is clean ("CREATE A LEAGUE" + "HAVE AN INVITE CODE") with two clear CTAs | Only screen with any `<h1>` semantics |
| 4 | League Chat | 7 / 10 | Real-time + @mentions + search + edit/delete shipped | No keyboard escape; messages lack accessible roles |
| 5 | Live Scores + Joker | 6 / 10 | Empty state "No live fixtures right now" is honest but offers no next action | No CTA when nothing is live |
| 6 | Transfer Market | 5 / 10 | Forced 3-step tour ("1/3"); long lists with no skeleton during load | No filter persistence; no search-by-name (only position filter) |
| 7 | Settings & Profile | 2 / 10 | **`/settings` route does not exist** — silently redirects to Scores | No way to view/edit profile, change password, or log out from a settings screen |
| 8 | Error & Empty States | 5 / 10 | Mixed: League/Recap have CTAs; Auctions/Live have just text | `SquadScreen` has a `fetchError` state set but never rendered |

---

## 3. UX Framework Scoring

| Dimension | Score | Evidence |
|---|---|---|
| Information Architecture & Nav | 6 / 10 | 5 clear bottom-nav items ✓ but **RecapScreen and BracketScreen are orphaned** (reachable only by direct URL); no global back button affordance |
| Flow & Clarity | 6 / 10 | Wizards well-structured (onboarding has step indicator, skippable steps 1–3) but auto-triggering tours undermine clarity |
| Feedback & Responsiveness | 5 / 10 | No skeletons anywhere; only plain text "Loading…" strings; `SquadScreen` sets `fetchError` but never renders it; Toast component exists ✓ |
| Cognitive Load | 7 / 10 | Screen layouts clean; eyebrow + display + body typography hierarchy intentional |
| Consistency | 5 / 10 | No `<Button>` component → ~15 inline button styles across screens; two cyans in auth; modals split between `ConfirmModal` and ad-hoc sheets |
| Mobile Responsiveness | 6 / 10 | No horizontal overflow ✓; bottom nav 75×64px ✓; BUT tour controls 59×17 and 22×22 px, tabs 94×34 px (all below 44px) |
| Accessibility | 3 / 10 | **0 aria-labels site-wide; 0 heading elements on 7 of 8 screens; focus rings overridden by inline styles; auth inputs lack `id`** |
| Performance / Perceived Speed | 7 / 10 | Vite build fast, but absence of skeletons makes slow networks feel laggy |

**UX average: 6.4 / 10** (target: 7.5)

---

## 4. UI Framework Scoring

| Dimension | Score | Evidence |
|---|---|---|
| Visual Hierarchy | 7 / 10 | `.fk-display` / `.fk-eyebrow` / `.fk-mono` classes give strong visual rhythm |
| Design Tokens Adherence | 5 / 10 | tokens.css well-defined but bypassed: `#555`/`#111`/`#9E9E9E` in BracketScreen, `#FFB300` in AdminSeedScreen, `#00C4E8` + `#000` in AuthScreen, `#0A0A0A` in DraftRecoveryScreen |
| Responsive Design | 7 / 10 | Tailwind breakpoints respected; mobile bottom-nav vs desktop sidebar works ✓ |
| Color & Contrast | 7 / 10 | Dark `#080A0E` ink + `#F2EEE5` paper gives strong contrast. No formal WCAG audit done. |
| Typography | 8 / 10 | Archivo / Archivo Black / JetBrains Mono — coherent system, clear hierarchy |
| Spacing | 6 / 10 | 8-step token scale exists but components inline Tailwind values without consistent mapping |
| Icons | 4 / 10 | Mix of emoji (⚽ 📋 ⚡ ⚠️) and SVG. Emoji breaks brand on Android and is invisible to screen readers. NavIcons SVGs lack aria-labels. |
| States (hover/focus/disabled/loading) | 4 / 10 | Hover via inline handlers works on desktop, but no visible focus rings, no skeletons, no disabled-state styling |

**UI average: 5.5 / 10** (target: 7.5)

---

## 5. ROI-Prioritized Improvement Strategy

Each item: **Impact** (user value × frequency) × **Effort** (engineering hours). ROI = Impact ÷ Effort.

### 🟢 Phase 1 — Quick Wins (Week 1–2, ~6.5h dev)

| # | Fix | Effort | Impact | ROI |
|---|---|---|---|---|
| QW1 | Strengthen global `:focus-visible` outline + ensure inline-styled buttons don't override it | 0.5h | 🔴 Critical | ★★★★★ |
| QW2 | Replace `#00C4E8` with `var(--cyan)` in AuthScreen | 0.25h | 🟠 High | ★★★★★ |
| QW3 | Make onboarding tours opt-in (don't auto-fire on Squad/Market) | 1h | 🟠 High | ★★★★★ |
| QW4 | Render `SquadScreen.fetchError` state as banner with retry | 1h | 🟠 High | ★★★★ |
| QW5 | Resize tour controls + tabs to 44px minimum | 1h | 🟠 High | ★★★★ |
| QW6 | Add aria-labels to NavIcons SVGs + icon-only buttons | 1h | 🟡 Med | ★★★★ |
| QW7 | Add `id` + `htmlFor` linking on AuthScreen inputs | 0.25h | 🟡 Med | ★★★★ |
| QW8 | Stub or hide `/settings` route until built | 0.5h | 🟡 Med | ★★★★ |
| QW9 | Replace `#555`/`#111`/`#9E9E9E` in BracketScreen with tokens | 1h | 🟡 Med | ★★★ |

**Lifts accessibility from 3 → 6, polish perception sharply.**

### 🟡 Phase 2 — Structural Wins (Week 3–6, ~38h dev)

| # | Fix | Effort | Impact | ROI |
|---|---|---|---|---|
| ST1 | Create `<Button>` component (primary/secondary/ghost/icon variants with focus/hover/disabled/loading built in) | 6h | 🔴 Critical | ★★★★★ |
| ST2 | Create `<Skeleton>` component + apply on Squad / Market / Live / League list loads | 4h | 🟠 High | ★★★★★ |
| ST3 | Create `<Modal>` wrapper + migrate `ConfirmModal`, `PlayerPickerSheet`, `H2HSheet` | 6h | 🟠 High | ★★★★ |
| ST4 | Create `<TextInput>` / `<Select>` form components with built-in label + error + helper text | 4h | 🟠 High | ★★★★ |
| ST5 | Build `/settings` screen (profile, password, logout, replay tours) | 6h | 🟠 High | ★★★★ |
| ST6 | Add proper `<h1>` per route + skip-to-content link | 2h | 🟡 Med | ★★★★ |
| ST7 | Standardize empty states with `<EmptyState>` component | 4h | 🟡 Med | ★★★ |
| ST8 | Move emoji icons to SVG icon set (or wrap in `<span aria-hidden>`) | 4h | 🟡 Med | ★★★ |
| ST9 | Replace remaining hardcoded hex in AdminSeedScreen / DraftRecoveryScreen / HomeScreen | 2h | 🟢 Low | ★★★ |

**After this, UX/UI score jumps from 6.0 → 7.8.**

### 🟠 Phase 3 — User-Visible Strategic Improvements (Week 7–12, ~39h dev)

| # | Fix | Effort | Impact | ROI |
|---|---|---|---|---|
| S1 | Global "back" affordance on nested routes | 4h | 🟠 High | ★★★★ |
| S2 | Market search-by-name input | 3h | 🟠 High | ★★★★ |
| S3 | Persist Market filter + sort + scroll position | 3h | 🟠 High | ★★★★ |
| S4 | Live screen suggests next action when no live fixtures | 2h | 🟡 Med | ★★★★ |
| S5 | Inline retry on error toasts | 3h | 🟡 Med | ★★★ |
| S6 | WCAG AA color contrast audit | 4h | 🟡 Med | ★★★ |
| S7 | Keyboard shortcuts (`g s`, `g l`, `g m` + `?` cheatsheet) | 8h | 🟡 Med | ★★★ |
| S8 | Command Palette (⌘K) for player search / league switch | 12h | 🟡 Med | ★★ |

### 🔴 Phase 4 — New Feature ROI Assessment

**Do (clear ROI):**

| Feature | Effort | Business value |
|---|---|---|
| Push notifications (match events, bet results, transfer deadline) | 16h | Engagement +20–30% (industry standard) |
| Live activity / lock-screen widget showing live points | 16h | Premium perception, mobile differentiator |
| Captain auto-recommendation based on form + fixtures | 12h | Stickiness for the 70% non-power users |
| Promote RecapScreen from orphan → nav-linked season recap | 4h | Cheap retention win |
| Onboarding A/B variant — skip to "auto-fill my squad" CTA | 4h | Activation +10–15% |

**Don't (poor ROI for current MVP scale):**

| Feature | Why not |
|---|---|
| Native dark/light theme toggle | Already dark-only with strong brand — toggle costs ~16h and dilutes brand |
| Custom avatar uploads | Initials work fine. Storage + moderation cost > engagement lift at <10k users |
| AI-generated bet recommendations | LLM cost + latency for marginal value over template-based bets |
| Cross-league squad mode (~40h refactor) | Big architectural lift for unclear demand. Survey users first. |
| Stat-heavy player comparison views | Forza API gaps mean stats are partial. Build after API gaps closed. |
| Marketplace / paid leagues | Regulatory + payments overhead; not the MVP fight |
| Native desktop app (Electron / Tauri) | Web app already covers 1280px; near-zero incremental users |

---

## 6. Sequencing & Investment

```
Week 1–2:  Phase 1 quick wins         (~6.5h dev)   → UX 6.4 → 7.2, A11y 3 → 6
Week 3–6:  Phase 2 component system   (~38h dev)    → UX 7.2 → 7.8, UI 5.5 → 7.5
Week 7–12: Phase 3 strategic UX       (~39h dev)    → UX 7.8 → 8.3
Week 13+:  Phase 4 ROI-positive feats (cherry-pick) → Engagement +20–30%
```

**Total investment to reach "Good" target (7.5+):** ~45h dev = roughly 1.5 sprints.

---

## 7. Evidence Appendix

**Computed-style findings (captured via preview_eval on live dev server, 2026-05-16):**

- Authenticated-user route survey: 7 of 8 screens render with `0` heading elements; `/league` is the only screen with `1` heading; `0` aria-labels site-wide.
- `/settings` silently redirects to Scores (route undefined; falls through to `<Navigate to="/" />`).
- Mobile (375px) measured touch targets:
  - Bottom-nav items: 75 × 64 px ✓ (meets WCAG 44px)
  - "Skip tour": 59 × **17** px ✗
  - "?" help: **22 × 22** px ✗
  - Squad tabs (⚽ PITCH / 📋 LIST / ⚡ CHIPS / ⚠️ STATUS): 94 × **34** px ✗
- Auth screen computed colors:
  - Active tab border: `rgb(0, 196, 232)` = `#00C4E8` (off-brand cyan)
  - Submit button background: `rgb(0, 180, 216)` = `#00B4D8` (token `--cyan`)
- Loading state DOM search across `/squad /market /live /league`: `hasSkeleton: false`, `hasSpinner: false`, `hasShimmer: false`, `hasLoadingText: false`.
- Focus outline on first interactive element across `/squad /market /live /league`: `outline: "<color> none 0px"` — none of these screens currently produce a visible focus ring on first-press TAB because inline styles override the global `:focus-visible` rule.
- Auth form inputs: 2 inputs found, both without `id` — so even if `<label>` elements exist, association by `htmlFor` is impossible.

**Document history**

| Date | Author | Note |
|---|---|---|
| 2026-05-16 | Claude Code | Initial assessment + ROI strategy; Phase 1 fixes shipped in same PR |
