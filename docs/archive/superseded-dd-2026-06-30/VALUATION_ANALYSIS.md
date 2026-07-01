# Valuation Analysis — Forza Fantasy League

> **INTERNAL ONLY.** Contains target price and negotiating reasoning. Do **not** include in any buyer-facing handover pack. Last updated: 2026-06-26.

This is a reasoning framework, not an appraisal. It is grounded in the technical due diligence (`TECHNICAL_DUE_DILIGENCE.md`) and standard early-stage software-asset valuation methods. Final price depends heavily on **buyer type** and **what is actually being sold** (code/IP vs. a running business with users and revenue).

---

## 1. What is actually for sale?

Be explicit, because it moves the number by an order of magnitude:

| Scenario | What transfers | Valuation basis |
|----------|----------------|-----------------|
| **A. Code/IP asset sale** | Source, docs, architecture, the multi-sport platform; ~50 pilot users, ~£0 revenue | Cost-to-recreate + strategic premium |
| **B. Product + small pilot** | Above + the live football product, brand, pipeline, external integrations | Asset value + early traction premium |
| **C. Business sale** | Above + meaningful revenue/retention | Revenue multiple (not applicable yet) |

Today the platform is firmly in **A–B**: feature-complete across 3 sports, functional in production, but pre-revenue with a ~50-user pilot and the hardening backlog outstanding. **Revenue-multiple valuations (C) do not apply** — there is no recurring revenue to multiply.

---

## 2. Method 1 — Cost-to-recreate (the floor)

What would it cost a competent team to rebuild this from scratch to the same functional state? This sets a defensible floor for an asset/acqui-hire deal.

**Build scope:** ~40K LOC React frontend, 21 Edge Functions, 229 migrations of game logic, 3 sport modules, real-time scoring pipeline, social layer, P2P coin system, native mobile shells, plus the domain design work (scoring rules, draft algorithms, transfer/auction/bet logic).

**Estimate:** A 2–3 engineer team would need roughly **9–15 months** to reach this functional surface, including the domain-modelling iteration that the migration history shows was non-trivial.

- Blended fully-loaded cost (2.5 senior engineers + part-time product/design): ~£18–28k/month.
- 9–15 months → **~£160k–£420k** of build cost.
- Discount for the documented debt a buyer inherits (no test coverage of core logic, single environment, security fixes needed): the asset is worth *less* than a clean rebuild on the quality axis, but *more* on the time-to-market axis (it works now). These roughly offset for a technical buyer.

**Cost-to-recreate floor: ~£150k–£400k.**

---

## 3. Method 2 — Strategic / time-to-market value (the realistic range)

A strategic buyer (an existing fantasy/sports-media/betting operator, or a team wanting to enter the space) isn't paying for lines of code — they're paying to **skip 9–15 months and launch a multi-sport product now**. Value drivers:

**Positive multipliers**
- **Multi-sport from day one** (football + F1 + tennis) — most competitors are single-sport. This is the headline strategic asset.
- **Working real-time scoring pipeline** with live external data integration — the hardest part to build and the easiest to undervalue.
- **P2P engagement/coin layer + Stripe path** — a monetisation primitive already in place.
- **Native mobile shells** ready (not yet shipped, but the wrapper exists).
- **Extensive documentation** — materially reduces buyer onboarding risk (rare for an asset this size).

**Negative adjustments (the DD findings price these in)**
- No automated test coverage of money/game logic → buyer assumes regression risk.
- Single environment, no PITR, manual backups → operational risk + setup cost.
- A few live security holes (quick fixes, but they signal maturity) → diligence drag.
- Bleeding-edge stack + god-components → higher near-term maintenance cost.
- Owner-tied infra + external API accounts → transfer friction.
- Pre-revenue, tiny pilot → no demand proof.

**Net:** the strategic upside (multi-sport, working pipeline, monetisation primitive) is real and rare; the deductions are tractable and well-documented (≈5–6 engineer-months to clear). For a motivated strategic buyer this lands at roughly **£350k–£750k**, with the documentation and multi-sport breadth pulling toward the upper half if a competitive process exists.

---

## 4. Recommended target range

| Posture | Range | When to use |
|---------|-------|-------------|
| **Walk-away floor** | **£150k** | Pure asset/acqui-hire, single uninterested buyer, you want out |
| **Realistic target** | **£350k–£600k** | Strategic buyer, you can articulate the multi-sport + pipeline story and show the (costed) roadmap |
| **Stretch / competitive** | **£700k–£1M** | Two or more strategic bidders; or after you've (a) cleared Phase 0–1 of the backlog, (b) shown 6+ months of pilot retention, (c) booked even modest revenue |

**Anchor your ask at the top of "Realistic" (~£600k)** and justify it with: time-to-market saved (Method 2), the multi-sport differentiator, and the documentation/roadmap that de-risks the purchase. Let the floor (£150k) stay private.

---

## 5. How to move the number up before/ during a sale

Each of these is worth more than its engineering cost:

1. **Clear Phase 0 security fixes (≈1 week).** Removes the single most damaging diligence finding for ~£0. Highest ROI action available.
2. **Stand up staging + PITR + a test harness for the core RPCs (Phase 1–2).** Converts "inherits significant risk" into "production-grade asset" — can justify a 30–50% uplift.
3. **Show pilot traction.** Even 6 months of retention/engagement data on the ~50 users (and ideally growth to a few hundred) shifts the conversation from "asset" toward "product with demand."
4. **Book any revenue.** Turning on the coin/Stripe path and showing even small recurring revenue opens the door to revenue-multiple framing (Method C), which is typically far higher than asset framing.
5. **Confirm API transferability** (Forza especially). A buyer paying a premium needs assurance the football data feed transfers; an unresolved dependency caps the price.

---

## 6. One-line summary

**Pre-revenue technical-asset sale today: target £350k–£600k** (floor £150k, stretch £700k–£1M with a competitive process or after clearing Phase 0–1). The multi-sport platform + working live-scoring pipeline + monetisation primitive are the value; the documented hardening backlog is the discount — and clearing its first two phases is the fastest way to raise the number.
