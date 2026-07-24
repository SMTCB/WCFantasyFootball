# Valuation Analysis — Forza Fantasy League

> **INTERNAL ONLY.** Contains target price and negotiating reasoning. Do **not** include in any buyer-facing handover pack. Last updated: 2026-06-30. The prior 2026-06-26 edition is archived at [docs/archive/superseded-dd-2026-06-30/VALUATION_ANALYSIS.md](../../archive/superseded-dd-2026-06-30/VALUATION_ANALYSIS.md).

This is a reasoning framework, not an appraisal. It is grounded in the technical due diligence ([TECHNICAL_DUE_DILIGENCE.md](TECHNICAL_DUE_DILIGENCE.md)) and the buyout assessment ([B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](../architecture/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md), now **6.5/10**, up from 4/10). Final price depends on **buyer type** and **what is actually being sold** (code/IP vs. a running business with users and revenue).

---

## 0. What changed since the last valuation (2026-06-26)

The prior valuation was set against a 4/10 buyout-readiness score with a live security gap and the three structural blockers (portability, provider-independence, reproducibility) all failing. Since then:

- **Phase-0 security is closed** (HMAC-verified auth, gated scoring functions, client-immutable `is_admin`, hardened Stripe path) — the single most damaging diligence finding is gone.
- **Two of the three structural blockers are substantially addressed** — containerization + project-ref externalization (Test A), and the provider-adapter seam (Test B).
- **Multi-sport is now built, not a roadmap** — F1 + Tennis (7 screens each), `sports`/`circles`/`trophy_ledger` schema, clubhouse-centric IA. The headline strategic asset is real and demoable.
- **The P2P coin economy is built and legally clean** (no cash-out path).
- **Engineering hygiene improved** — 0 npm vulns, CI security gate, function-drift gate, lazy-loaded screens, Node pinned.

**Net effect on value:** the strategic upside is now *demonstrable* rather than *promised*, and the diligence drag is materially reduced. This moves the realistic range up and tightens the discount. The remaining discount items have narrowed to **schema reproducibility, money-logic test coverage, and operational DR** (≈6–10 engineer-weeks, down from ≈5–6 engineer-months).

---

## 1. What is actually for sale?

| Scenario | What transfers | Valuation basis |
|----------|----------------|-----------------|
| **A. Code/IP asset sale** | Source, docs, architecture, the multi-sport platform; ~50 pilot users, ~£0 revenue | Cost-to-recreate + strategic premium |
| **B. Product + small pilot** | Above + the live football product, brand, pipeline, external integrations | Asset value + early traction premium |
| **C. Business sale** | Above + meaningful revenue/retention | Revenue multiple (not applicable yet) |

Today the platform is firmly in **A–B**: feature-complete across 3 sports, functional in production, Phase-0-clean, but pre-revenue with a ~50-user pilot and a (now smaller) hardening backlog. **Revenue-multiple valuations (C) still do not apply** — no recurring revenue to multiply.

---

## 2. Method 1 — Cost-to-recreate (the floor)

What would it cost a competent team to rebuild this to the same functional state? This sets a defensible floor for an asset/acqui-hire deal.

**Build scope (larger than the prior estimate, because more is now built):** ~41K LOC React frontend, 19 deployable Edge Functions, 243 migrations of game logic, **three working sport modules** (football + F1 + tennis), a real-time scoring pipeline, the Clubhouse social layer, a **built P2P coin economy with a hardened Stripe path**, a provider-adapter seam, containerized dev surface, native mobile shells, plus the domain design work (scoring rules, draft algorithms, transfer/auction/bet logic).

**Estimate:** A 2–3 engineer team would need roughly **11–16 months** to reach this functional surface, including the multi-sport build-out and the P2P economy that have landed since the prior valuation, and the domain-modelling iteration the migration history shows was non-trivial.

- Blended fully-loaded cost (2.5 senior engineers + part-time product/design): ~£18–28k/month.
- 11–16 months → **~£200k–£450k** of build cost.
- The inherited-debt discount is now *smaller* than before (Phase-0 security done, containerization + provider seam + multi-sport done; remaining debt is schema reproducibility, tests, DR). On the quality axis the asset is closer to a clean rebuild than it was; on the time-to-market axis it is strongly ahead.

**Cost-to-recreate floor: ~£200k–£450k** (up from £150k–£400k, reflecting the larger built surface).

---

## 3. Method 2 — Strategic / time-to-market value (the realistic range)

A strategic buyer (an existing fantasy/sports-media/betting operator, or a team entering the space) is paying to **skip 11–16 months and launch a multi-sport product now**.

**Positive multipliers (strengthened since the prior valuation)**
- **Multi-sport is now built and demoable** (football + F1 + tennis), not a roadmap — most competitors are single-sport. This is the headline strategic asset, and it is no longer a "price the plan as work" item.
- **Working real-time scoring pipeline** with live external data integration — the hardest part to build, idempotent and recovery-equipped.
- **Built, legally clean P2P coin economy + hardened Stripe path** — a monetisation primitive that is wired (UI + ledger + escrow + webhook), with no cash-out edge.
- **Provider-adapter seam + containerized dev** — directly answers the two buyer-DD blockers; the Opta stub shows where a buyer's feed plugs in.
- **Closed Phase-0 security** — removes the finding most likely to derail a diligence pass.
- **Extensive documentation** (CLAUDE.md + TRACKER + architecture/DD docs) — materially reduces onboarding risk; rare for an asset this size.
- **Native mobile shells** ready (not yet shipped, but wrapped + a mobile-first UX redesign done).

**Negative adjustments (fewer and more contained than before — priced by the V2 DD)**
- **Schema irreproducibility (DATA-1)** — 243 migrations / 19 duplicate prefixes, hand-applied, no `schema.sql`. A buyer still can't rebuild from the repo; blocks staging + tests. *The dominant remaining discount.*
- **No automated test coverage of money/game logic (TEST-1)** — buyer assumes regression risk; mitigated by the now-available local DB for building a harness.
- **No operational DR (OPS-1)** — single environment, no PITR, manual backups.
- **Provider seam half-consumed + runtime Supabase-locked** — feed swap scoped but not finished; "run on our cloud" still a re-platforming project.
- **Pre-revenue, tiny pilot** — no demand proof.

**Net:** the strategic upside (multi-sport *built*, working pipeline, legally-clean monetisation, security clean) is now real and demonstrable; the deductions are fewer, well-documented, and ≈6–10 engineer-weeks to clear. For a motivated strategic buyer this lands at roughly **£450k–£850k**, with the multi-sport breadth, the closed security gate, and the documentation pulling toward the upper half — especially if a competitive process exists.

---

## 4. Recommended target range

| Posture | Range | When to use |
|---------|-------|-------------|
| **Walk-away floor** | **£200k** | Pure asset/acqui-hire, single uninterested buyer, you want out |
| **Realistic target** | **£450k–£750k** | Strategic buyer; you can demo three working sports, the live-scoring pipeline, the coin economy, and the closed security gate, and show the (smaller, costed) roadmap |
| **Stretch / competitive** | **£850k–£1.2M** | Two or more strategic bidders; or after you've (a) cleared the remaining P0–P1 (schema baseline + staging/PITR + a test harness), (b) shown 6+ months of pilot retention, (c) booked even modest coin/Stripe revenue |

**Anchor your ask near the top of "Realistic" (~£750k)** and justify it with: time-to-market saved (Method 2, now 11–16 months), the *built* multi-sport differentiator, the closed Phase-0 security gate, the provider seam + containerization that de-risk transfer, and the documentation/roadmap. Let the floor (£200k) stay private.

> **Why the whole range moved up ~30%** vs. the prior valuation: the multi-sport capability and P2P economy are now *built* (not roadmap), the security gate is *closed*, and two of the three structural buyer-DD blockers are *addressed* — three of the biggest prior discount drivers have flipped to value drivers. The remaining discount is real but smaller and more contained.

---

## 5. How to move the number up before/during a sale

Each of these is worth more than its engineering cost:

1. **Establish the reproducible schema baseline (DATA-1, ~1–1.5 wk).** This is now the single most damaging *remaining* diligence finding and the cheapest of the four to fix. Removing it directly unblocks staging + a test harness and answers "Test C." Highest-ROI action available.
2. **Stand up staging + PITR + a test harness for the hotspot RPCs.** Converts "inherits significant risk" into "production-grade asset" — can justify a further 20–40% uplift. The local DB (docker-compose) is already in place, so the harness is cheaper to start than before.
3. **Wire the cross-sport trophy emission (ARCH-1).** Cheap, and it lets you *demo the unified meta-leaderboard* — the visual proof of the multi-sport selling point.
4. **Activate Sentry + edge alerting (OPS-2).** A money-handling app with live error tracking reads as far more mature; cheap to switch on.
5. **Show pilot traction.** 6+ months of retention/engagement (ideally growth to a few hundred users) shifts the conversation from "asset" toward "product with demand."
6. **Book any revenue.** Turning on the coin/Stripe path (now built and hardened) and showing even small recurring revenue opens revenue-multiple framing (Method C) — typically far higher than asset framing. *This is now a switch-it-on action, not a build.*
7. **Confirm API transferability** (Forza especially; OpenF1/RapidAPI secondary). A buyer paying a premium needs assurance the data feeds transfer; the provider seam helps the story but the commercial SLAs still need confirming.

---

## 6. One-line summary

**Pre-revenue technical-asset sale today: target £450k–£750k** (floor £200k, stretch £850k–£1.2M with a competitive process or after clearing the remaining schema/test/DR items). The *built* multi-sport platform, the working live-scoring pipeline, the legally-clean built coin economy, and the now-closed security gate are the value; the documented hardening backlog — narrowed to schema reproducibility, money-logic tests, and DR — is the discount, and clearing the schema baseline first is the fastest way to raise the number.

---

*Grounded in: [TECHNICAL_DUE_DILIGENCE.md](TECHNICAL_DUE_DILIGENCE.md), [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](../architecture/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md), [TRACKER.md](../TRACKER.md). Last updated: 2026-06-30.*
