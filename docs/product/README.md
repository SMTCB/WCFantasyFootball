# Product Documentation

Index and overview of product strategy, roadmap, and planning for Forza Fantasy League.

---

## Quick Navigation

**For Product Managers**:
1. [PIPELINE.md](PIPELINE.md) — Sprint roadmap, timeline, and delivery phases
2. [../BACKLOG.md](../BACKLOG.md) — Prioritized features and technical gaps (P0–P3 tiers)
3. [12_MONTH_ROADMAP_2026_2027.md](12_MONTH_ROADMAP_2026_2027.md) — Long-term strategic vision

**For Designers**:
1. [../brand/BRANDING.md](../brand/BRANDING.md) — Color palette, typography, design system
2. [../brand/FORZAKIT-UI-Overhaul.md](../brand/FORZAKIT-UI-Overhaul.md) — UI redesign specs and components

**For Business/Strategy**:
1. [12_MONTH_ROADMAP_2026_2027.md](12_MONTH_ROADMAP_2026_2027.md) — Year-long planning and feature phases
2. [../BACKLOG.md](../BACKLOG.md) — Current status and effort allocation

---

## Document Overview

| File | Purpose | Audience | Status |
|------|---------|----------|--------|
| [PIPELINE.md](PIPELINE.md) | Sprint roadmap, phases (Phase 1 MVP → Phase 2a/2b POST-LAUNCH) | PM, leadership | Current (updated 2026-05-28) |
| [12_MONTH_ROADMAP_2026_2027.md](12_MONTH_ROADMAP_2026_2027.md) | Year-long strategic vision (Q2 2026–Q2 2027) | Business, strategy | Reference (archive) |

---

## Product Phases

### Phase 1: MVP (2026-05-28 Shipped)
✅ **Completed and launched**

**Features**:
- User authentication (email/password)
- Squad building with 11-player formation validation
- League creation (Head-to-Head only)
- Transfer market (buy/sell players with budget)
- League chat & standings
- Live match updates with Joker chip
- Scoring system (weekly fantasy points)
- Player status alerts (injury/suspension)

**Platforms**:
- Web app (Vercel)
- iOS/Android (Capacitor native)

---

### Phase 2a: Post-Launch Stability (Weeks 1–4)
🚀 **In Progress**

**Focus**: RLS enablement, API optimization, observability

**Key Items**:
- [ ] Enable Row-Level Security on all tables
- [ ] Implement lightweight observability (5-minute setup per function)
- [ ] API response time optimization (<500ms p95)
- [ ] Player status sync pipeline tuning
- [ ] Chat performance at scale

**Timeline**: 2026-06-11 → 2026-07-09

---

### Phase 2b: Feature Expansion (Weeks 5–12)
📅 **Planned**

**Focus**: Trading, auctioning, betting, cup tournaments

**Key Features**:
- [ ] Trade proposals (player swaps between managers)
- [ ] Auction system (silent bidding, reserve prices)
- [ ] Betting system (league-wide prediction markets)
- [ ] Cup tournaments (knockout competitions)
- [ ] Multi-tournament support (EPL + World Cup modes)
- [ ] Draft system (fantasy draft with lottery)

**Timeline**: 2026-07-10 → 2026-09-04

---

### Phase 3: Polish & Scale (Month 4+)
🎨 **Future**

**Focus**: Performance, retention, monetization

**Key Items**:
- [ ] Performance optimization (animation, bundle size)
- [ ] Advanced analytics dashboard
- [ ] Social features (friend add, player ratings)
- [ ] Monetization (season pass, cosmetics)
- [ ] Internationalization (i18n)
- [ ] Push notifications (native + web)

**Timeline**: 2026-09-05 onwards

---

## Current Status (2026-05-28)

**MVP shipped and live** at https://wc-fantasy-football.vercel.app

**Key metrics**:
- Web app: Fully functional, E2E tested
- Mobile: iOS/Android native wrappers ready (not yet submitted to App Store)
- Backend: 89 database migrations, scoring pipeline active, chat working
- Test coverage: 36 CI tests passing, 8 integration specs manual
- Documentation: Complete architecture, API, brand, and deployment guides

**Known gaps** (P0–P3 backlog):
- RLS not yet enforced (security gap)
- API response times need optimization
- Draft system not yet implemented
- Auction/betting systems incomplete
- Full mobile app store submission pending

See [../BACKLOG.md](../BACKLOG.md) for complete prioritized list with effort estimates.

---

## Strategic Goals

### 2026 (Launch Year)
- **Q2**: Ship MVP on web + Capacitor (✅ done 2026-05-28)
- **Q3**: Stabilize + enable RLS + begin feature expansion
- **Q4**: Feature complete (trades, auctions, bets, cups, draft)

### 2027 (Growth Year)
- **Q1**: Optimize performance, expand to 50K+ active users
- **Q2**: Advanced analytics, monetization features, internationalization

---

## Related Documents

- [PIPELINE.md](PIPELINE.md) — Detailed sprint roadmap and timeline
- [12_MONTH_ROADMAP_2026_2027.md](12_MONTH_ROADMAP_2026_2027.md) — Strategic vision (archived, reference only)
- [../BACKLOG.md](../BACKLOG.md) — Prioritized open items with effort estimates
- [../CLAUDE.md](../CLAUDE.md) — Technical implementation instructions

---

Last Updated: 2026-05-28
