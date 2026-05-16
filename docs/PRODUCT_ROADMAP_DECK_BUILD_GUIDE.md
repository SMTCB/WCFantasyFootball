# Product Roadmap Deck — Build Guide

**Purpose**: Comprehensive framework for creating an interactive, consulting-style HTML presentation of Forza Fantasy League's 4-year strategic roadmap.

**Document Type**: Build specification and content guide  
**Intended Output**: Single-page interactive HTML deck  
**Target Audience**: Investors, enterprise partners, board members, strategic partners  
**Format**: Modern, fluid, IDEO-inspired design with clear visual hierarchy

---

## Table of Contents

1. [Overview & Vision](#overview--vision)
2. [Design & Technical Specifications](#design--technical-specifications)
3. [Slide-by-Slide Content Guide](#slide-by-slide-content-guide)
4. [Interactive Features](#interactive-features)
5. [Visual Design System](#visual-design-system)
6. [Build Instructions](#build-instructions)
7. [Testing Checklist](#testing-checklist)

---

## Overview & Vision

### Deck Purpose

Create a **consulting-quality strategic product roadmap** presented as an interactive HTML deck that:

- Tells the story of Forza Fantasy League's evolution from single-sport app to global platform
- Positions the company for Series A or strategic partnership discussions
- Demonstrates product vision, revenue model, and path to $5-8M ARR
- Uses IDEO design thinking principles to frame the approach
- Maintains engagement through modern design, smooth animations, and interactive navigation

### Core Message

> **"From Niche Fantasy App to Global Sports Platform"**
>
> A four-phase evolution (2026–2029+) powered by user obsession, human-centered design, and capital-efficient growth. Multiple revenue streams. 3B+ addressable market. Proven unit economics.

### Key Outcomes After Viewing

Viewer should understand:
1. Current state (Phase 1: single-sport mastery in PL fantasy)
2. Vision (Phase 4: 100+ leagues, multiple sports, ecosystem partnerships)
3. Revenue model (consumer + enterprise + ecosystem = $5-8M ARR)
4. Defensibility (data moats, white-label lock-in, regulated markets)
5. Next 12 months (tactical roadmap, decision gates)

---

## Design & Technical Specifications

### Technical Stack

**Language**: HTML5 + CSS3 + Vanilla JavaScript  
**File Type**: Single `.html` file (self-contained)  
**Dependencies**: None (no external libraries)  
**Browser Support**: Chrome, Firefox, Safari, Edge (modern versions)  
**Responsiveness**: Desktop-optimized (1280px+), tablet-friendly

### Color Palette

Use the official Forza brand colors plus strategic accents:

```
Primary:
  --gold: #D4A574
  --ink: #1a1a1a
  
Neutrals:
  --white: #ffffff
  --light: #f5f3f0
  --text-primary: #2d2d2d
  --text-secondary: #666666
  --border: #e0e0e0

Accents (for phase distinction):
  --accent-blue: #2b5aa0     (Phase 2)
  --accent-green: #4a9d6f    (Phase 3)
  --accent-purple: #7c3aed   (Phase 4)
  --accent-orange: #ea580c   (General emphasis)
```

### Layout Structure

**Two-column layout:**
- **Left sidebar** (280px): Dark navigation, sticky
  - Header: Logo, "Strategic Roadmap" subtitle
  - Nav items: 11 numbered slides
  - Controls: Prev/Next buttons, slide counter
  - Footer: Product name, date
  
- **Main area** (flex): White slides, centered content
  - Max-width: 900px centered
  - Padding: 60px horizontal, 40px top
  - Smooth transitions between slides

### Navigation System

**Three ways to navigate:**
1. **Sidebar nav items** — Click any slide name to jump
2. **Keyboard** — Arrow keys (← previous, → next)
3. **Buttons** — Prev/Next buttons below slide counter

**Active state**: Highlighted nav item (gold background, bold text)  
**Disabled state**: Prev button disabled on slide 1, Next on slide 11

### Animations & Transitions

- Slide transitions: 600ms ease in/out
- Transform: translateX (slide enters from right, exits to left)
- Card hover effects: Scale (1.05), subtle shadow, gold border
- All animations should feel smooth and professional (not jarring)

---

## Slide-by-Slide Content Guide

### Slide 0: Title / Overview

**Type**: Title slide  
**Duration**: 20-30 seconds (intro)

**Layout**:
- Centered, large typography
- Main title: "Forza Fantasy League"
- Subtitle: "From Niche Fantasy App to Global Sports Platform"
- Three stat cards below:
  - Icon + metric + description

**Content**:

```
Title: Forza Fantasy League
Subtitle: From Niche Fantasy App to Global Sports Platform

Three key metrics:
1. ⏱️ 4-Year Horizon
   Phase 1→4 Evolution

2. 💰 Multi-Revenue
   $5M+ ARR Target

3. 🌍 Global Scale
   50+ Sports & Leagues
```

**Tone**: Aspirational, clear, ambitious

---

### Slide 1: IDEO Approach

**Type**: Methodology slide  
**Duration**: 45-60 seconds

**Layout**:
- Slide subtitle: "Our Design Methodology"
- Large heading: "Human-Centered Product Evolution"
- 5 card grid (2 rows: 3 cards, then 2 cards below)
- Each card: icon, title, description

**Content**:

```
Card 1: 🔍 Empathize
"Understand fantasy sports fans across sports, geographies, 
and engagement levels. What keeps them coming back?"

Card 2: 💡 Define
"Identify the core problem: fragmentation. Fans must use 
different apps per sport. We unify the experience."

Card 3: 🎨 Ideate
"Explore platform models: single-sport mastery → multi-sport 
hub → white-label infrastructure → real sports."

Card 4: 🛠️ Prototype
"Test each phase with real users. MVP for multi-sport in 
Phase 2 before enterprise in Phase 3."

Card 5: 📊 Test & Measure
"Validate revenue models and user retention. Data informs 
each phase gate decision."

Callout box (gold/orange accent):
"Guiding Principle: Each phase is a complete, valuable product 
on its own. We don't force users into Phase N features; we delight 
them with Phase N experiences while building toward Phase N+1."
```

**Tone**: Methodical, human-centered, design-forward

---

### Slide 2: Phase 1 — Foundation

**Type**: Phase detail slide  
**Duration**: 60-90 seconds  
**Badge**: Yellow "Phase 1: 2026 (Current)"

**Layout**:
- Phase badge (yellow)
- Large heading: "Single-Sport Mastery"
- Intro paragraph (context)
- Two-column section:
  - Left: Functional goals (bulleted)
  - Right: Business goals (bulleted)
- Blue callout box with rationale

**Content**:

```
Heading: Single-Sport Mastery

Intro paragraph:
"Establish Forza Fantasy League as the premier Premier League 
fantasy football app. Build a loyal, engaged user base with 
exceptional UX."

Functional Goals:
✓ 11-player squad builder with formation validation
✓ Real-time league standings & H2H scoring
✓ Live match updates with Joker chip
✓ League chat & community features
✓ Mobile-native iOS/Android (Capacitor)
✓ Cross-platform sync (web + mobile)

Business Goals:
✓ 50K active users (target)
✓ $2-5 per user/month (premium features)
✓ 40%+ retention after onboarding
✓ Launch seasonal leagues (auto-refresh)
✓ Establish brand in UK/Europe
✓ Prove product-market fit

Blue callout:
"Why This Phase: Perfect the core fantasy football experience. 
Build a brand known for quality. Establish data infrastructure 
and user behavior insights for future multi-sport expansion."
```

**Tone**: Focused, tactical, achievable

---

### Slide 3: Phase 2 — Multi-Sport Platform

**Type**: Phase detail slide  
**Duration**: 90+ seconds  
**Badge**: Blue "Phase 2: 2027-2028 (12-18 Months)"

**Layout**:
- Phase badge (blue)
- Large heading: "Multi-Sport Platform"
- Intro paragraph
- Sports expansion grid (5 icons + names + fan counts)
- Two-column detail section:
  - Left: Product features
  - Right: Success metrics
- No callout (content is dense)

**Content**:

```
Heading: Multi-Sport Platform

Intro paragraph:
"Expand to 5-10 additional sports. Enable fans to manage fantasy 
teams across cricket, basketball, NFL, La Liga, and more from one app."

Sports Grid (5 sport cards):
1. 🏀 NBA — 20M fans
2. 🏏 Cricket — 1.1B fans
3. 🏈 NFL — 115M fans
4. ⚾ MLB — 80M fans
5. ⚽ La Liga — 500M fans

Product Features:
✓ Unified dashboard across sports
✓ Cross-sport leagues (mixing competitors)
✓ Sport-specific scoring algorithms
✓ Shared chat across mixed-league users
✓ Bankroll management (cross-sport)

Success Metrics:
✓ 200K+ total active users
✓ 15% monthly active use rate
✓ $1M+ MRR (multi-sport)
✓ 5+ sports live and scoring
✓ Global availability (50+ countries)
```

**Tone**: Expansive, data-driven, market-focused

---

### Slide 4: Phase 3 — Enterprise & White-Label

**Type**: Phase detail + business model slide  
**Duration**: 90-120 seconds  
**Badge**: Green "Phase 3: 2028-2029 (Enterprise)"

**Layout**:
- Phase badge (green)
- Large heading: "Enterprise & White-Label"
- Intro paragraph
- Three customer cards (horizontal)
- Comparison table (6 rows: Component, Configuration, Customer Control)
- Two-column section (Revenue + Metrics)

**Content**:

```
Heading: Enterprise & White-Label

Intro paragraph:
"Become the infrastructure platform for fantasy sports. Sell 
white-label solution to leagues, broadcasters, and operators."

Three Target Customers:
1. LaLiga / Premier League
   "Official fantasy platform on white-label"

2. ESPN / Sky Sports
   "Integrate into broadcast ecosystems"

3. Betting Operators
   "White-label for sports betting platforms"

Comparison Table:
Component | Configuration | Customer Control
-----------|--------------|------------------
Branding | Full white-label (logos, colors, domain) | 100% customer
League Rules | Configurable scoring, constraints, chips | Customer defined
Monetization | Premium tiers, pass-through ad network | Shared (70/30 split)
Data Integration | Real-time stats feeds for any sport | Customer provides API
User Auth | OAuth SSO with customer identity | 100% customer

Enterprise Revenue:
• $500K-$2M annual licenses
• 30-40% revenue share on user transactions
• Custom API integration fees
• Per-active-user SaaS fees

Target: $3M+ ARR
• 5-10 enterprise customers
• 5M+ users on white-label
• Infrastructure scales to 100+ leagues
• Platform profits from scale
```

**Tone**: Enterprise-grade, partnership-focused, high-value

---

### Slide 5: Phase 4 — College Sports & Real Sports

**Type**: Phase detail + opportunity slide  
**Duration**: 60-90 seconds  
**Badge**: Purple/pink "Phase 4: 2029+ (Ecosystem)"

**Layout**:
- Phase badge (purple)
- Large heading: "College Sports & Real Sports Integration"
- Intro paragraph
- Two-column section:
  - Left: College sports initiative
  - Right: Real sports bridge
- Blue callout box with revenue potential

**Content**:

```
Heading: College Sports & Real Sports Integration

Intro paragraph:
"Enter untapped markets: college sports and bridge to real 
sports betting."

College Sports Initiative:
Insight: 10M+ college sports fans, zero unified fantasy platform.

✓ College football (NCAA FBS)
✓ College basketball (March Madness)
✓ Esports (League of Legends, Valorant)
✓ Internal admin app for coaches
✓ Player performance tracking tool

Real Sports Bridge:
Opportunity: Integrate real sports betting through licensed partners.

✓ Affiliate partnerships (DraftKings, FanDuel)
✓ Fantasy-to-betting conversion
✓ Unified wallet (fantasy + real money)
✓ Responsible gaming tools built-in
✓ Revenue share from referrals

Blue callout:
"Revenue Potential: College sports + betting partnerships unlock 
$5M-$10M ARR. Fantasy becomes the discovery layer for a $10B+ 
sports betting market."
```

**Tone**: Visionary, opportunity-focused, long-term strategic

---

### Slide 6: Revenue Model

**Type**: Financial model slide  
**Duration**: 90-120 seconds

**Layout**:
- Large heading: "Multiple Revenue Streams"
- Intro paragraph
- Three sections (Consumer, Enterprise, Ecosystem)
- Each section has 2 revenue stream cards
- Green callout box at bottom with $5-8M ARR target

**Content**:

```
Heading: Multiple Revenue Streams

Intro paragraph:
"Diversified, defensible revenue model across consumer, enterprise, 
and ecosystem."

💚 Consumer (Direct):
  Card 1: $500K–$1M ARR
  "Premium Tiers — $2-5/mo (ad-free, advanced stats, chip coaching)"

  Card 2: $300K–$700K ARR
  "Pass-Through Ads — Sports betting, DFS platforms 
  (cost-per-click referral)"

💼 Enterprise (B2B):
  Card 1: $2M–$3M ARR
  "White-Label Licenses — $500K-$2M per league/operator annually 
  + 30% revenue share"

  Card 2: $500K–$1M ARR
  "Custom Integration — APIs, data feeds, branded mobile apps 
  ($100K+ per client)"

🎓 Ecosystem (Strategic):
  Card 1: $1M–$2M ARR
  "Betting Affiliate Revenue — CPA & revenue share with DraftKings, 
  FanDuel, Kambi"

  Card 2: $500K–$1M ARR
  "College Sports Licensing — NCAA, conference partnerships, 
  internal admin tools"

Green callout:
"💰 Total Target: $5M–$8M ARR by 2029

No single revenue stream exceeds 40% of total → portfolio resilience. 
Diversification protects against platform risk."
```

**Tone**: Data-driven, confident, well-structured

---

### Slide 7: White-Label Strategy

**Type**: Strategic partnership slide  
**Duration**: 90 seconds

**Layout**:
- Large heading: "White-Label Strategy"
- Intro paragraph
- Two-column section (Why leagues buy | Why Forza wins)
- Orange callout box with target customers
- 2x2 matrix (high impact/low effort, high effort high impact)

**Content**:

```
Heading: White-Label Strategy

Intro paragraph:
"Licensing Forza's platform to official leagues and major broadcasters."

Why Leagues Buy:
📱 Turn passive fans into engaged users
💰 Revenue share (30-40% of user spend)
📊 First-party data on fan behavior
⏱️ Launch in 6 months (not 2+ years)
🎯 Focus on core (broadcast/teams) vs. tech

Why Forza Wins:
📈 Recurring $500K-$2M per customer
🔁 60%+ margins on platform (not COGS)
🌍 Scales across 100+ leagues globally
🏆 Defensible: league data moat
💼 Enterprise relationships = upsell path

Orange callout - Target Customers (Phase 3–4):
LaLiga — 500M fans globally
NBA — 1.5B digital reach
ESL (Esports) — 500M+ esports fans
BT Sport — UK broadcaster

Matrix (high impact/low effort | high effort high impact):
Cell 1 (yellow): High Impact / Lower Effort
  🚀 NBA white-label
     ESL partnership
     Cricket Board (India)
  → Pursue aggressively

Cell 2 (blue): High Impact / High Effort
  💎 LaLiga platform
     NFL gaming integration
     Disney+ integration
  → Strategic but requires resources
```

**Tone**: Partnership-focused, strategic, opportunity-driven

---

### Slide 8: Real Sports & Betting Integration

**Type**: Ecosystem slide  
**Duration**: 75-90 seconds

**Layout**:
- Large heading: "Real Sports & Betting Integration"
- Intro paragraph + "Why This Matters" section
- Two color-coded boxes (Fantasy user | Perfect betting customer)
- Two-column detail section (Affiliate revenue | Responsible gaming)
- Purple callout with key insight

**Content**:

```
Heading: Real Sports & Betting Integration

Intro paragraph:
"Bridge from fantasy to real sports betting — the $10B+ market opportunity."

Why This Matters:
"Fantasy sports fans are 4-6x more likely to bet on the same sport. 
Our platform becomes the discovery and funnel layer into betting."

Box 1 (yellow): Fantasy User
"Engaged, game-playing mindset, understands odds."

Box 2 (blue): Perfect Betting Customer
"Ready to place real money bets on same sport."

Affiliate Revenue:
• $15-30 CPA (cost-per-acquisition)
• 20% of first deposit (DraftKings)
• 5-15% revenue share (FanDuel)
• Target: $1-2M ARR at scale

Responsible Gaming:
• Loss limits & cool-off periods
• Age verification (21+)
• Self-exclusion tools
• Comply with all regulations

Purple callout:
"Key Insight: We don't become a sportsbook. We remain the engagement 
layer and earn from partnerships. Risk is mitigated; upside is massive."
```

**Tone**: Strategic, risk-aware, growth-focused

---

### Slide 9: Risks & Opportunities

**Type**: Risk/opportunity matrix slide  
**Duration**: 90-120 seconds

**Layout**:
- Large heading: "Risks & Opportunities"
- Two-column layout (Critical Risks | Key Opportunities)
- Left column: 4 red matrix cells
- Right column: 4 yellow/green matrix cells
- Large callout box with mitigation strategy

**Content**:

```
Heading: Risks & Opportunities

🔴 Critical Risks (red matrix cells):

Cell 1: Regulatory Risk
"Gambling regulations vary by jurisdiction. College sports 
especially risky."

Cell 2: API/Data Risk
"Depend on official sports APIs. If provider cuts access, 
product breaks."

Cell 3: Competitive Pressure
"ESPN, DraftKings, FanDuel could build similar white-label."

Cell 4: Retention in Multi-Sport
"Harder to retain casual users across 10 sports than 1."

🟢 Key Opportunities (yellow/green matrix cells):

Cell 1: International Expansion
"Cricket (India, Pakistan), La Liga (Spain), EPL (UK/global) 
= 3B+ addressable market."

Cell 2: Esports Dominance
"No unified fantasy esports platform yet. First-mover 
advantage huge."

Cell 3: Leagues Want This
"LaLiga, NBA actively seeking white-label platforms. 
Inbound demand exists."

Cell 4: Betting Partnership Moat
"Exclusive affiliates with DraftKings/FanDuel lock out 
competitors."

Large callout (tan/gold background):
"Mitigation Strategy:

✓ Regulatory: Partner with legal counsel in each market. 
  Start with regulated geographies (UK, NJ, NY).

✓ Data: Build relationships with API providers early. 
  Consider custom integrations where needed.

✓ Competition: Move fast to white-label (2028). Lock in 
  league partnerships before bigger players.

✓ Retention: Design for casual users. Not all users need 
  all sports; sport-specific communities matter."
```

**Tone**: Balanced, risk-aware, solution-focused

---

### Slide 10: Next Steps — Roadmap

**Type**: Timeline slide  
**Duration**: 90 seconds

**Layout**:
- Large heading: "Next 12 Months: Roadmap"
- Vertical timeline with 4 quarters
- Each timeline item: quarter name, bullet point description
- Orange callout box with decision gate (Q2 2027)

**Content**:

```
Heading: Next 12 Months: Roadmap

Timeline (vertical, with dot indicators):

Q2 2026: Foundation (Now)
✅ Launch Phase 1 (PL fantasy). Hit 10K active users. 
   Establish product-market fit metrics. Begin white-label biz dev.

Q3 2026: Growth & Testing
✅ Reach 25K active users. Test Phase 2 prototype 
   (1-2 additional sports). Begin enterprise conversations 
   with 3-5 leagues.

Q4 2026: Scale & Validate
✅ Hit 50K users. Launch Phase 2 beta (multi-sport). 
   Sign first white-label customer (pilot agreement). 
   Plan college sports.

Q1 2027: Enterprise Lock-In
✅ 100K+ users across platform. 2-3 white-label live. 
   Begin college sports technical planning. Revenue to $250K MRR.

Orange callout (decision gate):
"Decision Gate: Q2 2027

Assess Phase 2 metrics. If 80K+ users and retention >35%, 
commit to Phase 3 (white-label at scale). If not, pivot to 
single-sport + niche enterprise (e.g., college only)."
```

**Tone**: Tactical, measurable, forward-looking

---

### Slide 11: Closing / Thank You

**Type**: Closing slide  
**Duration**: Final impression

**Layout**:
- Centered, large typography
- Main title: "From Fantasy to Platform"
- Subtitle: tagline about approach
- Three value prop cards below
- Large callout box with key questions

**Content**:

```
Title: From Fantasy to Platform

Subtitle:
"A four-phase evolution powered by user obsession, IDEO thinking, 
and capital efficiency."

Three value prop cards:
1. 🎯 Product-Driven
   "Each phase is complete, valuable, defensible."

2. 💰 Multi-Revenue
   "Consumer + Enterprise + Ecosystem = $5-8M ARR."

3. 🌍 Global Scale
   "50+ sports, 100+ leagues, 3B+ addressable market."

Large callout box (dark background):
"Questions to Answer Before Phase 2:

1. Can we hit 50K+ users in PL fantasy by Q4 2026?
2. Do white-label conversations validate customer demand?
3. Can we manage multi-sport data/scoring reliably?
4. What's our college sports technical approach?
5. Which betting partner alignment is best?"

Footer:
"Let's build the future of fantasy sports.
Forza Fantasy League — May 2026"
```

**Tone**: Aspirational, closing, forward-looking

---

## Interactive Features

### Navigation

**Sidebar Navigation**:
- Fixed dark sidebar (280px wide)
- All 11 slides listed with numbers + titles
- Click any item to jump to that slide
- Active slide highlighted (gold background)
- Smooth scroll if nav list is long

**Keyboard Navigation**:
- Right arrow key → next slide
- Left arrow key → previous slide
- Escape (optional) → close any fullscreen/modal (if added later)

**Button Navigation**:
- Prev button (gray) — disabled on slide 0
- Next button (gray) — disabled on slide 11
- Slide counter (e.g., "3 / 11")
- All buttons use gold accent color on hover

### Slide Transitions

**Animation Details**:
- Duration: 600ms
- Easing: ease in/out
- Direction: slides come in from right, exit to left
- Opacity fade: 0 → 1 (enter), 1 → 0 (exit)
- Transform: translateX (100px on enter, -100px on exit)

**Performance**:
- Use CSS transforms (GPU accelerated)
- Avoid reflows/repaints during animation
- Pre-render next slide (low opacity) for smooth perception

### Hover & Interactive States

**Cards**:
- Hover: scale(1.05), subtle shadow, gold border
- Transition: 300ms ease
- Cursor: pointer where clickable

**Buttons**:
- Hover: background color change, subtle scale
- Active: darker shade, slight indent effect
- Disabled: lower opacity, cursor: not-allowed

**Nav Items**:
- Hover: gold background highlight, scale slightly
- Active: bold text, gold background, left border accent
- Cursor: pointer

---

## Visual Design System

### Typography

**Font Family**: System fonts stack (Segoe UI, Roboto, SF Pro, etc.)  
**Fallback**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`

**Font Sizes**:
- H1 (slide titles): 3.5em
- H2 (section heads): 2.2em
- H3 (subsections): 1.3em
- Body text: 1.05em
- Small text (labels): 0.85-0.95em

**Font Weights**:
- Regular: 400
- Semi-bold: 600 (button labels, headers)
- Bold: 700 (main titles)

**Line Heights**:
- Headers: 1.2
- Body: 1.8
- Tight: 1.6

### Spacing Scale

Base unit: 4px (Tailwind-like scale)

```
Small spacing: 8px, 12px, 15px
Medium spacing: 20px, 25px, 30px
Large spacing: 40px, 50px, 60px
XL spacing: 80px+
```

**Card padding**: 25-30px  
**Section margins**: 30-40px  
**Top/bottom slide padding**: 60px  
**Sidebar width**: 280px

### Borders & Shadows

**Border Radius**:
- Buttons: 8px
- Cards: 12px
- Small elements: 4-6px

**Shadows**:
- Card hover: `0 10px 30px rgba(0,0,0,0.1)`
- Subtle: `0 2px 8px rgba(0,0,0,0.05)`
- Heavy (sidebar): `-5px 0 15px rgba(0,0,0,0.2)`

**Borders**:
- Cards: 1px solid var(--border)
- Accents: 2-4px solid (left border for sections)
- Minimal use; prefer spacing over lines

### Color Usage

**Text Colors**:
- Primary: var(--text-primary) #2d2d2d
- Secondary: var(--text-secondary) #666666
- On dark bg: white, reduced opacity for secondary

**Background Colors**:
- Main: white
- Card: light gradient or #fafafa
- Section: light gray with subtle gradient
- Callout: color-coded (blue, green, orange, etc.)

**Accent Usage**:
- Gold: primary CTA, hover states, important elements
- Ink: dark backgrounds, contrast
- Phase colors: distinguish between phases (blue, green, purple, orange)

### Grid & Layout

**Container Max-Width**: 900px (centered)  
**Sidebar**: Fixed 280px  
**Main area**: flex-grow 1  
**Gap sizes**: 15-30px (consistent with spacing scale)

**Grid columns**:
- 2-column: common for details
- 3-column: for feature/value prop cards
- 5-column: for sports expansion cards
- Responsive: collapse to 1 column on smaller screens

---

## Build Instructions

### Step 1: Set Up HTML Structure

Create a single HTML5 file with:
- DOCTYPE, meta tags, viewport
- Head section with CSS (internal `<style>`)
- Body with three main parts:
  1. `.deck-container` (flex wrapper)
  2. `.nav-sidebar` (dark left panel)
  3. `.slides-wrapper` (main content area)

### Step 2: Build the Sidebar

```html
<div class="nav-sidebar">
  <div class="nav-header">
    <h3>🎯 Roadmap</h3>
    <p>Strategic Product Evolution</p>
  </div>
  
  <nav id="nav-list">
    <div class="nav-item active" data-slide="0">📊 Overview</div>
    <div class="nav-item" data-slide="1">🎨 IDEO Approach</div>
    <!-- ... 11 items total ... -->
  </nav>
  
  <div class="nav-footer">...</div>
  <div class="controls">
    <button id="prev-btn" onclick="previousSlide()">← Prev</button>
    <span class="slide-counter"><span id="current">1</span> / <span id="total">11</span></span>
    <button id="next-btn" onclick="nextSlide()">Next →</button>
  </div>
</div>
```

### Step 3: Build Slide Container

```html
<div class="slides-wrapper">
  <div class="slide active">
    <!-- Slide 0 content -->
  </div>
  
  <div class="slide">
    <!-- Slide 1 content -->
  </div>
  
  <!-- ... 11 slides total ... -->
</div>
```

### Step 4: Add CSS

Include comprehensive CSS covering:
- Layout (flexbox, grid)
- Typography
- Colors and backgrounds
- Animations and transitions
- Component styles (cards, buttons, badges)
- Responsive breakpoints

**Key CSS patterns**:
```css
.slide {
  position: absolute;
  opacity: 0;
  transform: translateX(100px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.slide.active {
  opacity: 1;
  transform: translateX(0);
  position: relative;
  z-index: 10;
}
```

### Step 5: Add JavaScript

Minimal vanilla JS for:
- `showSlide(n)` — display slide n, update nav highlighting
- `nextSlide()` — increment and show
- `previousSlide()` — decrement and show
- Keyboard event listeners (arrow keys)
- Nav item click handlers
- Button state management (disable when at first/last slide)

**Key JS logic**:
```javascript
let currentSlide = 0;
const slides = document.querySelectorAll('.slide');
const totalSlides = slides.length;

function showSlide(n) {
  slides.forEach(slide => slide.classList.remove('active', 'prev'));
  if (n >= totalSlides) currentSlide = totalSlides - 1;
  if (n < 0) currentSlide = 0;
  
  slides[currentSlide].classList.add('active');
  if (currentSlide > 0) slides[currentSlide - 1].classList.add('prev');
  
  document.getElementById('current').textContent = currentSlide + 1;
  document.getElementById('prev-btn').disabled = currentSlide === 0;
  document.getElementById('next-btn').disabled = currentSlide === totalSlides - 1;
}
```

### Step 6: Test & Refine

- Test all navigation methods (sidebar, buttons, keyboard)
- Verify animations are smooth (DevTools > Performance)
- Check color contrast (WCAG AA for text)
- Test on mobile viewport (375px) — collapse sidebar
- Print to PDF — verify slide breaks look good
- Verify no console errors

---

## Testing Checklist

### Navigation Testing

- [ ] Sidebar click jumps to correct slide
- [ ] Arrow keys navigate left/right
- [ ] Prev button disabled on slide 0
- [ ] Next button disabled on slide 11
- [ ] Slide counter updates correctly
- [ ] Nav item highlights active slide

### Visual & Layout Testing

- [ ] Slide transitions are smooth (600ms)
- [ ] Text is readable on all slides
- [ ] Cards have proper spacing and alignment
- [ ] Images/icons render correctly
- [ ] Callout boxes are visually distinct
- [ ] Timeline is vertically aligned
- [ ] Matrix cells are properly formatted

### Responsive Testing

- [ ] Desktop (1280px): full layout, sidebar visible
- [ ] Tablet (768px): sidebar may condense, content reflows
- [ ] Mobile (375px): sidebar collapses or becomes tabs, vertical layout
- [ ] Landscape: content adapts appropriately

### Color & Contrast Testing

- [ ] Text on all backgrounds meets WCAG AA (4.5:1)
- [ ] Gold accents visible and distinct
- [ ] Phase badges are color-coded (blue, green, purple)
- [ ] Matrix cells are visually different
- [ ] Dark sidebar text is white and readable

### Browser Compatibility

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] No console errors
- [ ] Animations work in all browsers

### Content Verification

- [ ] All 11 slides present and load
- [ ] No typos or grammar errors
- [ ] Numbers/figures are accurate
- [ ] Revenue figures align ($5-8M ARR)
- [ ] Phase timeline is consistent
- [ ] All callout boxes have proper messaging

### Performance Testing

- [ ] Page loads quickly (< 2 seconds)
- [ ] Animations don't stutter (60 FPS)
- [ ] No memory leaks (test switching slides 50+ times)
- [ ] File size is reasonable (single HTML < 200KB)

---

## Build Prompt Template

**Use this prompt in the next session to build the deck:**

```
I need to create a strategic product roadmap HTML presentation for 
Forza Fantasy League. The presentation should be a single-page interactive 
deck with 11 slides.

Reference: See the PRODUCT_ROADMAP_DECK_BUILD_GUIDE.md for complete 
content, design specs, and slide-by-slide details.

Key requirements:
- Modern, consulting-style design (IDEO-inspired)
- Interactive navigation (sidebar, keyboard, buttons)
- Smooth slide transitions (600ms)
- Responsive design (desktop-optimized, mobile-friendly)
- Single HTML file, no external dependencies
- Use Forza brand colors (gold #D4A574, ink #1a1a1a)
- Professional typography and spacing

Deliverable: PRODUCT_ROADMAP_DECK.html (self-contained)

Start by:
1. Creating the HTML structure with sidebar nav and slides
2. Building all 11 slides per the guide content
3. Adding CSS for layout, typography, animations
4. Adding JavaScript for navigation and interactivity
5. Testing all features before finalizing
```

---

## Reference Assets

### Color Palette Reference

```
Brand Colors:
--gold: #D4A574
--ink: #1a1a1a

Neutrals:
--white: #ffffff
--light: #f5f3f0
--text-primary: #2d2d2d
--text-secondary: #666666
--border: #e0e0e0

Phase Accents:
Phase 1 (2026): --accent-orange #ea580c (yellow badge background: #fef3c7)
Phase 2 (2027): --accent-blue #2b5aa0 (blue badge background: #dbeafe)
Phase 3 (2029): --accent-green #4a9d6f (green badge background: #d1fae5)
Phase 4 (2029+): --accent-purple #7c3aed (purple badge background: #f3e8ff)
```

### Component Library

**Slide Badge**:
- Background: phase-specific color (light)
- Text: phase-specific color (dark)
- Padding: 8px 16px
- Border-radius: 20px
- Font-size: 0.85em

**Content Section Card**:
- Background: light gradient or #fafafa
- Padding: 40px
- Border-left: 4px solid var(--gold) or accent color
- Border-radius: 12px
- Font: dark text on light background

**Matrix Cell**:
- Padding: 20px
- Border: 2px solid
- Border-radius: 10px
- Background: gradient or light color
- Text: dark with proper contrast

**Timeline Item**:
- Left padding: 50px for text
- Dot indicator: 24px, positioned absolute left
- Border: subtle line connecting dots (optional)
- Font: h3 for period, p for description

---

## Future Enhancements (Post-MVP)

Consider adding in future iterations:
- Print to PDF button (or use browser print)
- Dark mode toggle (invert colors)
- Presenter notes (hidden by default)
- Slide export (individual slides as images)
- Timer/clock for timed presentations
- Fullscreen mode (F11)
- Zoom level control
- Animated charts/graphs (on Phase 3 revenue slide)

---

## Document History

| Date | Changes | Author |
|------|---------|--------|
| 2026-05-16 | Initial Product Roadmap Deck Build Guide | Claude Code |
