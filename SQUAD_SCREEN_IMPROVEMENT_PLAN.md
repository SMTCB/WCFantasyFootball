# Squad Screen Improvement Plan

**Focus Areas:** Layout clarity, feature discoverability, reducing symbol confusion (mobile), making chips/roulette/danger zone intuitive

**Current State:** The SquadScreen is feature-rich but has information architecture and UX issues that create friction on both desktop and mobile, particularly around feature discovery and understanding.

---

## 1. Current State Analysis

### What's Working Well
- ✅ **Pitch visualization** — Beautiful, grid-based layout with stripe texture and markings
- ✅ **Player card interactions** — Clear captain/joker/swap affordances on the pitch
- ✅ **Data loading** — Proper fallback to demo data when DB is empty
- ✅ **Confirmation modals** — FB-023 prevents accidental chip activation/selling
- ✅ **Responsive structure** — Mobile and desktop layouts are well-separated

### Key Problems Identified

#### Problem 1: Icon Confusion (Mobile Tabs)
**Current:** Tab labels use emoji symbols `⚽ Pitch`, `≡ Squad`, `⚙ Tools`
- **Issue:** The hamburger icon (≡) for "Squad" is ambiguous — users may expect it to mean "menu" or "settings"
- **Issue:** The gear icon (⚙) for "Tools" is not intuitive for **feature controls** like chips and roulette
- **Impact:** New users don't immediately know what's in each tab

**Target:** Use text + icons that clearly communicate each tab's purpose

---

#### Problem 2: Tools Tab Overcrowding (Mobile)
**Current:** "Tools" tab contains 5 conceptual groups:
1. Active chips badge (informational)
2. Power Chips section (Wildcard, Triple Captain)
3. Captain Tools section (Roulette)
4. Daily Joker section (Joker picker)
5. Player Status section (Danger zone alerts)

- **Issue:** All crammed into one scrolling container with inconsistent visual hierarchy
- **Issue:** Users scrolling through 5+ full-height cards to understand what's available
- **Issue:** Related features (Captain tools + Roulette) are separate sections without clear connection

**Target:** Reorganize into clearer groups with visual separation and stronger hierarchy

---

#### Problem 3: Feature Discoverability (Desktop)
**Current:** Chips tab shows all features (2× chips + roulette + joker)
- **Issue:** Roulette and Joker are "captain-adjacent" features but live in Chips tab
- **Issue:** No clear visual grouping of what's "captain related" vs "chip related"
- **Issue:** Status tab has danger zone alerts but they're secondary to captain info

**Target:** Make related features visually connected and logically grouped

---

#### Problem 4: Swap/Sub Language Ambiguity
**Current:** Bottom sheet buttons say "↑ Sub In" / "↓ Sub Out"
- **Issue:** Arrow symbols may not be immediately understood; new users might confuse "subbing" with "selling"
- **Issue:** Mobile users with one-hand operation see small, tappable targets

**Target:** Clearer button labels with better visual affordance

---

#### Problem 5: Joker Locked State Lacks Context
**Current:** Joker picker shows lock emoji (🔒) + text "Joker already locked for today"
- **Issue:** Users don't understand **why** it's locked or **when** it unlocks
- **Issue:** No indication of which player is currently locked as joker

**Target:** Show the locked player, explain the daily reset, provide visual clarity

---

#### Problem 6: Formation Validation Breaks Flow
**Current:** Invalid swaps trigger `alert()` with formation error
- **Issue:** Alerts are disruptive and don't fit the premium aesthetic
- **Issue:** User loses context of what they were trying to do
- **Issue:** No in-UI guidance before attempting swap (no "formation rules" shown)

**Target:** Predictive validation — show formation rules upfront, disable invalid swaps before user attempts

---

#### Problem 7: Danger Zone Discovery
**Current Mobile:** Small banner at top of pitch tab that can be dismissed; indicator dot on "Tools" tab
**Current Desktop:** Hidden in "Status" tab
- **Issue:** Users may not notice the small banner
- **Issue:** Mobile indicator dot (red circle) is small and easy to miss
- **Issue:** Desktop users have to click into Status tab to see alerts

**Target:** Persistent, non-dismissible visual signal for at-risk players; optional detailed view

---

#### Problem 8: Budget Display Lacks Visual Weight
**Current:** Header shows `$17M` budget remaining in small text
- **Issue:** Budget is critical game constraint but treated as secondary UI element
- **Issue:** No visual signal when budget is low (only color change)
- **Issue:** Users don't see budget until they scroll up to header

**Target:** Budget should be more prominent and persistent

---

#### Problem 9: Roulette Visual Feedback
**Current:** Large overlay during spin with text "Roulette Active..."
- **Issue:** The overlay is nice but blocks the pitch; users can't see the roulette spinning
- **Issue:** No audio/haptic feedback (just visual animation)
- **Issue:** After spin completes, user doesn't know they need to confirm

**Target:** Roulette spins ON the pitch itself; clear confirmation state after spin

---

#### Problem 10: Too Many Interaction Modes
**Current:** 6 different interaction states:
1. Player selection (bottom sheet)
2. Swap mode (banner + highlight targets)
3. Roulette spinning (overlay)
4. Joker picker (modal)
5. Chip toggle (confirmation modal)
6. Captain roulette (confirmation modal)

- **Issue:** Users must understand each mode's entry/exit points
- **Issue:** Mobile real estate consumed by multiple overlays and banners

**Target:** Streamline modes, make transitions clearer

---

## 2. Desktop-Specific Improvements

### 2.1 Right Sidebar Reorganization

**Current Structure:**
```
Tab: Bench | Chips | Status
├─ Bench: Player list
├─ Chips: 2× full chip cards + Roulette + Joker
└─ Status: Danger list + Captain info
```

**Proposed Structure:**
```
Tab: Bench | Control Panel | Status & Alerts
├─ Bench: Player list (unchanged)
├─ Control Panel: Organized into 4 sections
│  ├─ [Captain Control] — Current captain + Roulette button
│  ├─ [Power Chips] — Wildcard, Triple Captain (cards)
│  └─ [Daily Joker] — Joker selector + current joker
└─ Status & Alerts: 
   ├─ [At Risk] — Injury/suspension banner
   └─ [Formation Rules] — Visual guide (optional detail)
```

**Rationale:**
- Bundles captain-related tools together
- Separates "power" features from "status" information
- Makes tabs purpose-clear: roster / controls / alerts

**Layout Details:**
```
┌─────────────────────┐
│ Bench | Controls | Status
├─────────────────────┤
│ Captain              │
│ ────────────────── │
│ [Current Captain]    │
│ [Roulette Button] ◀─ EMPHASIS
│                     │
│ Power Chips         │
│ ────────────────── │
│ [Wildcard Card]     │
│ [Triple Captain]    │
│                     │
│ Daily Joker         │
│ ────────────────── │
│ [Current Joker/+]   │
└─────────────────────┘
```

### 2.2 Captain Roulette Visual Redesign

**Current:** Roulette spins in overlay; users can't see pitch
**Proposed:**
- Roulette spins **on the pitch itself** — rapid cycle through selected player
- After spin, show **confirmation popover** with selected captain name and 2 buttons: "Confirm" / "Spin Again"
- Add **subtle sound effect** (optional toggle) for spin completion

**Implementation:**
```
Phase 1: Show spinning on pitch (no overlay)
Phase 2: Add confirmation state
Phase 3: Add sound (optional)
```

### 2.3 Budget Prominence

**Current:** Header shows budget in small `text-[20px]`
**Proposed:**
- Keep header budget but **add persistent mini-card in right pane**
- Card shows: Budget remaining + warning state if < 5M
- Optional sparkle/glow animation when budget is tight

---

## 3. Mobile-Specific Improvements

### 3.1 Tab Label Clarity

**Current:**
```
⚽ Pitch | ≡ Squad | ⚙ Tools
```

**Proposed Option A (Text + Icons):**
```
⚽ PITCH | 👥 SQUAD | 🛠 CONTROLS
```

**Proposed Option B (More Explicit):**
```
Pitch | Players | Chips & Tools
```

**Recommended:** Option A
- Uses text to disambiguate purpose
- Icons provide visual anchor
- Matches Barlow Condensed aesthetic already in use

### 3.2 Tools Tab Restructuring

**Current:** Single scrolling container with 5 sections
```
├─ Active chips badge
├─ Power Chips (full-height cards)
├─ Captain Tools (full-height card)
├─ Daily Joker (full-height card)
└─ Player Status (full-height card + list)
```

**Proposed:** Tab-within-tab structure for Controls
```
Tools Tab
├─ [Captain] | [Chips] | [Status] subtabs
│
└─ Captain subtab shows:
   ├─ Current captain badge
   ├─ [🎰 Spin Roulette] button (prominent)
   └─ 1-2 sentence explainer
   
   Chips subtab shows:
   ├─ Active chips badges (inline)
   ├─ [Wildcard] card
   ├─ [Triple Captain] card
   └─ [Daily Joker] card
   
   Status subtab shows:
   ├─ [At-Risk Players] list (if any)
   ├─ [All Clear] badge (if none)
   └─ Formation Rules (optional collapsible)
```

**Rationale:**
- Reduces vertical scroll in "Tools"
- Puts related features together
- Makes Roulette more discoverable (own subtab)

### 3.3 Joker Locked State

**Current:**
```
🔒 Joker already locked for today
```

**Proposed:**
```
┌──────────────────────────────┐
│ 🔒 Daily Joker Locked        │
├──────────────────────────────┤
│ [Club] [Player Name]         │
│ [Position] · [Team]          │
│                              │
│ Locked until tomorrow 10am   │
│ (Resets with new fixtures)   │
└──────────────────────────────┘
```

**Rationale:**
- Shows which player is locked (context)
- Explains when it resets (education)
- More compact while more informative

### 3.4 Swap/Sub Button Language

**Current:** `↑ Sub In` | `↓ Sub Out` | `Sell`
**Proposed:** 
- Mobile: `↑ Put On Pitch` | `↓ Move to Bench` | `Remove`
- Desktop: (keep as-is, space allows)

**Rationale:**
- Clearer intent than arrow symbols
- "Put on pitch" / "Move to bench" are direct, unambiguous
- "Remove" is clearer than "Sell"

### 3.5 Danger Banner Redesign

**Current:** Dismissible banner at top with compact badges
```
⚠️ [OUT] [DOUBTFUL] Smith, +2 more [View] [×]
```

**Proposed Option A (Persistent Alert):**
```
┌────────────────────────────┐
│ ⚠️ 3 players at risk        │
│                            │
│ [Smith - Out]              │
│ [Jones - Doubtful (87%)]   │
│ [Brown - Doubt... (92%)]   │
│                            │
│ [Tap to view more]         │
└────────────────────────────┘
```

**Proposed Option B (Compact + Tap):**
```
⚠️ At Risk: 3 players (Tap to view)
[Smith - Out] [More]
```

**Rationale:**
- Persistent: doesn't disappear on dismiss
- Tappable: opens detail view without full modal
- Prominent: appears above pitch
- Not dismissible: critical info shouldn't be hidden

---

## 4. Cross-Device Improvements

### 4.1 Formation Rules Panel

**Current:** No UI showing formation constraints; validation only via alert

**Proposed:** Collapsible "Formation Rules" card that shows:
```
┌────────────────────────────┐
│ Formation Rules            │
├────────────────────────────┤
│ [Expand] ▼                 │
│                            │
│ Current: 1-4-4-2           │
│ Minimum: 1 GK, 3 DEF      │
│           2 MID or FWD     │
│                            │
│ [Valid] ✓                  │
└────────────────────────────┘
```

**Behavior:**
- Always visible on desktop right pane
- Collapsible on mobile (in "Status" subtab)
- Updates in real-time as user swaps
- Shows green checkmark if valid, red warning if invalid

**Rationale:**
- Educates new users on constraints
- Prevents invalid swaps before attempting
- Reduces need for alert() dialogs

### 4.2 Visual Language for Feature States

**Current:** Inconsistent coloring and iconography
- Wildcard: green (🃏)
- Triple Captain: gold (🚀)
- Roulette: gold (🎰)
- Joker: purple (🃏)

**Proposed:** Tighten visual language
```
Feature Group         Icon    Color        Use Case
──────────────────────────────────────────────────
Captain Tools        🎯      Gold         Captain-related
├─ Captain           ★       Gold
├─ Roulette          🎰      Gold
└─ Chip (3×)         🚀      Gold

Chip Tools           🃏      Green        Squad modifications
└─ Wildcard          🃏      Green

Daily Boosts         ⚡      Purple       Per-day actions
└─ Joker             🃏      Purple

Risk Alerts          ⚠️       Red          Health/status
```

**Rationale:**
- Gold = captain/captain-adjacent
- Green = squad-wide power
- Purple = personal/daily
- Red = warning/action required

### 4.3 Unified Confirmation Pattern

**Current:** Multiple confirmation styles (modals, alerts, bottom sheet options)
**Proposed:** Standardize on slide-up confirmation card
```
┌────────────────────────────┐
│ Confirm Action             │
├────────────────────────────┤
│ Title: "Use Wildcard?"     │
│ Description: "Make unlimited free transfers..."
│ Warning: "This cannot be undone" (if dangerous)
│                            │
│ [Cancel] [Confirm]         │
└────────────────────────────┘
```

**Benefit:** Consistent interaction pattern everywhere

---

## 5. Feature-Specific Improvements

### 5.1 Chips (Wildcard + Triple Captain)

#### Desktop
**Current Layout:** Chips tab shows 2 full cards
**Proposed:**
- Keep full cards (they work well)
- Add icon badge showing "1 per season" near each card
- Show "Season 1" or "Used in GW3" metadata
- Add toggle animation when activating/deactivating

#### Mobile
**Current:** Same full-height cards in Tools → Chips subtab
**Proposed:** Same, but cards are slightly smaller to fit screen

**Visual Enhancement:**
- When active: Show subtle **pulsing animation** (not obnoxious)
- When activated: Brief **celebration animation** (confetti? or subtle bounce)

---

### 5.2 Captain Roulette

#### Desktop
**Current:** Confirmation modal → spins in overlay
**Proposed:**
1. Button in Control Panel right pane
2. Click → confirmation modal (same as chips)
3. Confirm → **roulette spins on pitch** (rapid player cycle)
4. After ~2.5s → highlight winning captain
5. Show "Roulette Complete" popover with winner name
6. User can "Confirm" or "Spin Again"

#### Mobile
**Current:** Same as desktop
**Proposed:**
1. Bigger, more prominent button in Captain subtab
2. Full-screen animation (roulette spins across center of pitch)
3. Confetti or celebration effect on completion
4. Confirmation popover

**Visual Enhancement:**
- Animated spin: players cycle faster, then slow down (deceleration curve)
- Winner highlight: glow effect + large name display
- Optional: Sound effect on spin completion (toggle in settings)

---

### 5.3 Daily Joker

#### Current Issues
1. Picker modal is full-screen (good on mobile, takes space on desktop)
2. "Locked" state doesn't show which player
3. Unlocking behavior isn't clear

#### Proposed Desktop Improvements
1. Joker selector changes from **modal** to **popover** attached to the Joker card
2. Popover shows: "Playing today" teams + quick player list (scrollable)
3. Selected joker shows as **inline player row** in Control Panel
4. "Clear Joker" button (if day's not locked yet)

#### Proposed Mobile Improvements
1. Keep modal for full screen (works well)
2. Add "Locked Joker" player card at top of list for context
3. Show clear unlock timer + countdown to tomorrow

#### Visual Enhancement
- Selected joker row has **subtle animation** (slide-in or fade)
- "Playing Today" section has team flags for quick scanning

---

### 5.4 Player Status / Danger Zone

#### Desktop
**Current:** Status tab shows danger list + captain info
**Proposed:**
1. Danger list gets **clearer visual hierarchy**
2. Each at-risk player shows: emoji + name + status badge + confidence %
3. Add **inline action**: "Consider swap" button → select and open swap picker
4. Captain info moved to Control Panel (better organization)

**Example:**
```
At-Risk Players

🤕 Smith, John (Forward)
└─ Out · 99% confidence
   └─ [Consider swap]

🟡 Jones, Mike (Defender)
└─ Doubtful · 87% confidence
   └─ [Consider swap]
```

#### Mobile
**Current:** Danger banner at pitch top + full list in Status subtab
**Proposed:**
1. Persistent (non-dismissible) banner with **tappable detail**
2. Tap → expands inline list in Status subtab
3. List shows same inline actions as desktop

---

### 5.5 Bench / Squad Roster

#### Current Issues
1. Desktop: Bench tab only shows subs; no starting XI
2. Mobile: Squad tab shows all players but no formation context

#### Proposed Desktop
1. Bench tab stays as-is (subs only)
2. Add optional **Formation View** button in Control Panel
3. Click → shows small formation card with GK/DEF/MID/FWD counts

#### Proposed Mobile
1. Squad tab shows players grouped by position
2. Add **mini formation badge** at top: "1 GK • 4 DEF • 4 MID • 2 FWD"
3. Formation badge updates in real-time as user swaps

---

## 6. Information Architecture Changes

### Before (Current)
```
SquadScreen
├─ Mobile
│  ├─ Tab: Pitch (pitch view + bench cards + danger banner)
│  ├─ Tab: Squad (player list by position)
│  └─ Tab: Tools (chips + roulette + joker + status)
└─ Desktop
   ├─ Left: Pitch + roster list
   └─ Right Sidebar
      ├─ Tab: Bench
      ├─ Tab: Chips (chips + roulette + joker)
      └─ Tab: Status (danger zone + captain)
```

### After (Proposed)
```
SquadScreen
├─ Mobile
│  ├─ Tab: Pitch (pitch view + bench cards + risk banner)
│  ├─ Tab: Squad (player list by position + formation badge)
│  └─ Tab: Controls
│     ├─ Subtab: Captain (current captain + roulette)
│     ├─ Subtab: Chips (chips active badges + chip cards + joker)
│     └─ Subtab: Status (at-risk players + formation rules)
└─ Desktop
   ├─ Left: Pitch + formation badge + roster list
   └─ Right Sidebar
      ├─ Tab: Bench (subs only)
      ├─ Tab: Control Panel
      │  ├─ Captain (current + roulette)
      │  ├─ Chips (wildcard + triple captain)
      │  └─ Joker (inline selector + current)
      └─ Tab: Status & Alerts
         ├─ At-risk players
         └─ Formation rules (collapsible)
```

---

## 7. Visual & Interaction Enhancements

### 7.1 Micro-interactions

| Action | Current | Proposed |
|--------|---------|----------|
| **Select player** | Instant bottom sheet | Slide-up + fade-in |
| **Set captain** | Instant state change | Glow effect on captain badge (2s) |
| **Activate chip** | Instant toggle | Pulse animation (3 beats) |
| **Spin roulette** | Overlay blocks pitch | Players cycle on pitch; confetti on win |
| **Sub player** | Instant swap | Swap animation: players slide positions |

### 7.2 Visual Feedback Enhancements

**Currently Missing:**
- Player swap animation
- Chip activation celebration
- Roulette visual confirmation
- At-risk player attention-grab

**Proposed:**
1. **Swap animation:** When user swaps players, animate both moving to new positions (200ms slide)
2. **Chip celebration:** When activated, brief confetti or particle effect on card
3. **Roulette:** Spinning players on pitch + winner highlight + sound (optional)
4. **Risk alerts:** Pulsing red border on at-risk player cards (on pitch and in status view)

---

## 8. Accessibility & Clarity Improvements

### 8.1 Tooltips & Help Text

**Current:** Minimal help; users must discover features
**Proposed:**
1. Add **hover tooltips** on desktop for all action buttons
2. Add **info icons** next to feature titles:
   - "Wildcard" → explains one-time use
   - "Triple Captain" → explains all-or-nothing mechanic
   - "Roulette" → explains random selection
3. Mobile: Tap icons → brief popover explanation

### 8.2 Keyboard Navigation (Desktop)

**Current:** All interactions are mouse/touch only
**Proposed:**
1. Tab through players (arrow keys to navigate pitch grid)
2. Enter to select/toggle
3. Esc to close modals/sheets

---

## 9. Mobile Viewport Specific

### 9.1 iPhone SE / Small Screens (<360px)

**Current:** Some cards may overflow
**Proposed:**
1. Test at 320px width (responsive ceiling)
2. Reduce card padding/margins on very small screens
3. Use smaller font sizes (scale labels down)
4. Ensure bottom sheet doesn't consume entire viewport (leave 20% visible)

### 9.2 Tablet Views

**Current:** Desktop layout applies at `lg` breakpoint (1024px+)
**Proposed:**
1. Add **tablet-specific layout** at `md` breakpoint (768px)
2. 2-column layout: pitch + tools sidebar (narrower than desktop)
3. Use card-based layout for tools (not full sidebar)

---

## 10. Implementation Priorities

### Phase 1 (Quick Wins) — 1-2 days
- [ ] Rename mobile tabs: `⚽ PITCH | 👥 SQUAD | 🛠 CONTROLS`
- [ ] Add mini formation badge to mobile Squad tab
- [ ] Improve joker locked state: show which player
- [ ] Rename swap buttons: `↑ Put on Pitch` / `↓ Move to Bench`
- [ ] Add persistent (non-dismissible) danger banner

### Phase 2 (UX Improvements) — 3-4 days
- [ ] Mobile Controls tab: restructure into 3 subtabs (Captain / Chips / Status)
- [ ] Desktop Control Panel: reorganize chips/roulette/joker into logical groups
- [ ] Add formation rules collapsible card
- [ ] Improve roulette UX: spin on pitch, show confirmation
- [ ] Add visual language consistency (colors + icons)

### Phase 3 (Polish) — 2-3 days
- [ ] Micro-interactions: player swap animation, chip celebration, roulette effect
- [ ] Tooltips & help text for all features
- [ ] Tablet responsive layout
- [ ] Keyboard navigation (desktop)
- [ ] Sound effects (optional toggle)

### Phase 4 (Future) — Post-season
- [ ] Advanced: Formation view with position cards
- [ ] Advanced: Injury impact prediction
- [ ] Advanced: Chip recommendation engine

---

## 11. Success Metrics

### Quantitative
- [ ] **Onboarding tour completion:** >80% of new users complete squad tour
- [ ] **Feature discovery:** All users aware of chips/roulette/joker within first 3 matchdays
- [ ] **Error rates:** <5% invalid formation attempts (predictive validation working)

### Qualitative
- [ ] **User feedback:** Users understand each tab's purpose without explanation
- [ ] **Support reduction:** Fewer questions about "how do I activate chips"
- [ ] **Feature adoption:** Roulette/joker used by >40% of active users

---

## 12. Design System Updates Needed

### Typography
- Keep Barlow Condensed for labels (already in use)
- Keep DM Sans for body text (already in use)

### Colors (Proposed Refinement)
```
Captain/Gold:      #F0B400 (existing Wildcard green now becomes gold)
Chips/Green:       #18C96B (existing)
Joker/Purple:      #9D5FF5 (existing)
Risk/Red:          #F03A3A (existing)
Success/Cyan:      #00C4E8 (existing)
```

### Component Library Updates
1. **FormationBadge** — new reusable component
2. **DangerBanner** — redesign as persistent alert
3. **ConfirmationCard** — unify all confirmation modals
4. **FeatureCard** — standardize chip/roulette/joker cards
5. **StatusBadge** — for injury/suspension states

---

## Appendix: Competitor Analysis

### FPL (Official Fantasy Premier League)
- ✅ Dashboard shows all transfers/chips at a glance
- ✅ Chip activation is 1-tap (no confirmation modal)
- ✅ Captain selection is prominent (easy to find)
- ❌ Lacks real-time animations

### Sleeper Fantasy
- ✅ Beautiful pitch visualization (similar to ours)
- ✅ Clear separation of "roster" vs "transaction" flows
- ✅ Daily lineup decisions are front-and-center
- ❌ Chip system is less discoverable

### DraftKings
- ✅ Stacked cards showing active boosts/multipliers
- ✅ Clear visual hierarchy (primary action = full-width button)
- ✅ Risk alerts are impossible to miss (banner + indicator)
- ❌ Information-dense interface can feel overwhelming

### Key Takeaways for Our Design
1. **Chips should be 1-2 taps** to understand and activate (less friction)
2. **Active features must be visible without scrolling** (prominence)
3. **Risk alerts should be persistent** (can't be dismissed)
4. **Visual hierarchy matters more than detail** (primary actions should stand out)

