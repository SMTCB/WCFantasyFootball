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

**Not covered:** signed-in screens were assessed from source rather than exercised live. Codebase counts and token/component findings are unaffected; anything about flow, state or in-app behaviour is out of scope.

**Status:** the 13 actions are not yet tracked in BACKLOG.md.

---

## Related Documents

- [BACKLOG.md](../../BACKLOG.md) — where these findings should be tracked when picked up
- [DOCS_MAP.md](../DOCS_MAP.md) — documentation index
- [CONVENTIONS.md](../reference/CONVENTIONS.md) — code and naming conventions

---

Last Updated: **2026-08-22**
