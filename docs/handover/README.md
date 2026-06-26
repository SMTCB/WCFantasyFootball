# Handover & Due-Diligence Documents

This folder holds the client-facing technical handover pack and its build tooling.
**The Markdown files are the source of truth. The PDFs are generated from them.**

## Documents

| Source (edit this) | Output | Audience |
|--------------------|--------|----------|
| `TECH_OVERVIEW.md` | `TECH_OVERVIEW.pdf` | High-level briefing for a technical stakeholder |
| `TECH_DOCUMENTATION.md` | `TECH_DOCUMENTATION.pdf` | Full technical reference |
| `../architecture/TECHNICAL_DUE_DILIGENCE.md` | `../architecture/TECHNICAL_DUE_DILIGENCE.pdf` | **Internal** remediation backlog (do not hand to a buyer as-is) |

> The valuation analysis (`../architecture/VALUATION_ANALYSIS.md`) is **internal only** — it contains your target price and negotiating reasoning. Never include it in the buyer pack.

## How to update (no repo re-discovery needed)

1. Edit the relevant `.md` file.
2. Regenerate the PDFs:
   ```bash
   python scripts/build-handover-pdfs.py
   ```
   To rebuild just one, pass a path substring:
   ```bash
   python scripts/build-handover-pdfs.py overview
   ```

The script (`scripts/build-handover-pdfs.py`) renders Markdown → styled HTML →
PDF via headless Chrome/Edge. No network is needed at render time.

**One-time setup** (per machine): `python -m pip install markdown pygments`

## Notes
- Styling lives in the `CSS` string inside the build script — tweak there.
- To add a new document, append a `(path, "Title")` tuple to the `DOCS` list in the script.
- PDFs are committed so they're shareable straight from the repo; re-run the
  script after any `.md` change so they don't drift.
