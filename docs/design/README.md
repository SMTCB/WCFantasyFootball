# Design & Accessibility Audits

**Source files for design/UX assessments of the Frontrow platform.**

---

## Contents

| File | What it is |
|------|------------|
| `DESIGN_AUDIT_2026-08.html` | The August 2026 audit, consolidated into a single report. Open it in a browser. |
| `canvas/*.dc.html` | The six artboards the same audit was first delivered on — Summary, Contrast, SignIn, Typography, SystemDrift, Roadmap. |
| `canvas/canvas.json` | Artboard layout for the above. |

Both were published as Claude artifacts:
- Report — https://claude.ai/code/artifact/06b5cc09-1dc1-4485-aab3-191582d1618b
- Canvas — https://claude.ai/code/artifact/dffc14bd-418a-4beb-853e-4f6e4ee8f377

The `canvas/` files are kept because a future update to the canvas re-seeds from them; without them it would have to be extracted back out of the published artifact.

---

## The August 2026 audit — summary

Assessed against `src/` at commit `1f4e937`. Fourteen findings: three critical, four high, four medium, three low. Every contrast figure was computed from the shipped token values under the WCAG 2.1 formula; every count is a repository count.

The thesis: the token layer and the primitive components are well built, and almost nothing imports them. 4,127 inline `style={{…}}` objects across 112 view files; `Select.jsx` has zero consumers against 30 raw `<select>` elements. The visible failures — invisible sign-in fields, four failing button states, 68% of type below 12px, 156 invisible surfaces left over from the dark→light migration — are downstream of that.

The report's final section maps all 14 findings onto 13 actions in the P0–P3 tiers used by [BACKLOG.md](../../BACKLOG.md), each with file, effort estimate and an acceptance check.

**Status:** the three P0 actions (A1, A2, A3) shipped 2026-08-23 via PR [#827](https://github.com/SMTCB/WCFantasyFootball/pull/827) — see BACKLOG.md. P1–P3 (B1–D2) remain untracked/deprioritized.

**Live verification pass (2026-08-23):** signed-in screens have now been exercised live under local demo mode, across eight routes. All 14 original findings held up; seven further contrast failures surfaced that source review couldn't catch (findings 15–21 in the report's ledger), four of them critical — including one at 1.22:1, effectively unreadable. These are now categorized into the report's own P0–P3 action tiers as E1–E4 (P0) and F1–F3 (P1), each with a verified file:line location — but not yet mirrored into BACKLOG.md. The one remaining gap: the demo account has no seeded league, so squad/league/draft/trade flows with real data are still unverified live.

---

## Related Documents

- [BACKLOG.md](../../BACKLOG.md) — where these findings should be tracked when picked up
- [DOCS_MAP.md](../DOCS_MAP.md) — documentation index
- [CONVENTIONS.md](../reference/CONVENTIONS.md) — code and naming conventions

---

Last Updated: **2026-08-23**
