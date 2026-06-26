#!/usr/bin/env python3
"""
Build styled PDFs from the handover Markdown documents.

WHY THIS EXISTS
---------------
The handover/DD documents are authored in Markdown (the source of truth, easy to
edit). This script renders them to client-ready PDFs so that when you update a
document you DON'T repeat a repo deep-dive — you just edit the .md and re-run:

    python scripts/build-handover-pdfs.py

Render chain (no network at render time): Markdown -> HTML (python-markdown,
with tables/toc/code) -> headless Chrome/Edge --print-to-pdf -> PDF.

One-time setup (already done on the authoring machine):
    python -m pip install markdown pygments

Outputs land next to their source .md (same folder, .pdf extension).
"""

import os
import re
import sys
import subprocess
import tempfile
from pathlib import Path

import markdown  # pip install markdown pygments

REPO = Path(__file__).resolve().parent.parent

# Documents to render: (source .md, "Document Title" for the PDF header)
DOCS = [
    ("docs/handover/TECH_OVERVIEW.md",            "Forza Fantasy League — Technical Overview"),
    ("docs/handover/TECH_DOCUMENTATION.md",       "Forza Fantasy League — Technical Documentation"),
    ("docs/architecture/TECHNICAL_DUE_DILIGENCE.md", "Forza Fantasy League — Remediation Backlog"),
]

# Candidate headless-browser executables (Windows), first that exists wins.
BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.5; color: #1a1a1a; max-width: 100%;
}
h1 { font-size: 20pt; color: #0b1f3a; border-bottom: 3px solid #c8a44d;
     padding-bottom: 6px; margin: 0 0 12px; }
h2 { font-size: 14pt; color: #0b1f3a; border-bottom: 1px solid #d8d8d8;
     padding-bottom: 4px; margin: 22px 0 8px; page-break-after: avoid; }
h3 { font-size: 11.5pt; color: #243b53; margin: 16px 0 4px; page-break-after: avoid; }
p, li { font-size: 10.5pt; }
code { font-family: "Cascadia Code", Consolas, monospace; font-size: 9pt;
       background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
pre { background: #0b1f3a; color: #e8eef7; padding: 12px; border-radius: 6px;
      overflow-x: auto; font-size: 8.5pt; line-height: 1.4; page-break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt;
        page-break-inside: avoid; }
th { background: #0b1f3a; color: #fff; text-align: left; padding: 6px 8px; }
td { border: 1px solid #d8d8d8; padding: 5px 8px; vertical-align: top; }
tr:nth-child(even) td { background: #f7f8fa; }
blockquote { border-left: 4px solid #c8a44d; margin: 10px 0; padding: 4px 14px;
             background: #faf7ef; color: #3a3a3a; }
hr { border: none; border-top: 1px solid #d8d8d8; margin: 18px 0; }
a { color: #1a5fb4; text-decoration: none; }
strong { color: #0b1f3a; }
.doc-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #d8d8d8;
              font-size: 8pt; color: #888; }
"""

HTML_TMPL = """<!DOCTYPE html><html><head><meta charset="utf-8">
<title>{title}</title><style>{css}</style></head>
<body>{body}<div class="doc-footer">{title} · Confidential · generated from {src}</div></body></html>"""


def find_browser():
    for b in BROWSERS:
        if os.path.exists(b):
            return b
    sys.exit("ERROR: no Chrome/Edge found for PDF rendering. Edit BROWSERS in this script.")


def render(md_rel, title, browser):
    src = REPO / md_rel
    if not src.exists():
        print(f"  SKIP (missing): {md_rel}")
        return
    text = src.read_text(encoding="utf-8")
    html_body = markdown.markdown(
        text, extensions=["tables", "fenced_code", "toc", "sane_lists", "codehilite"],
        extension_configs={"codehilite": {"noclasses": True}},
    )
    full = HTML_TMPL.format(title=title, css=CSS, body=html_body, src=md_rel)

    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        html_path = f.name
        f.write(full)

    out_pdf = src.with_suffix(".pdf")
    if out_pdf.exists():
        out_pdf.unlink()
    # Isolated profile per invocation so concurrent/back-to-back runs don't share
    # a singleton instance. Headless Chrome reliably WRITES the --print-to-pdf
    # file but sometimes won't self-exit; so we poll for the file to appear and
    # stabilise, then terminate the process rather than waiting on it.
    import time, shutil
    profile = tempfile.mkdtemp(prefix="cc-pdf-")
    proc = subprocess.Popen(
        [browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         "--no-first-run", "--no-default-browser-check",
         f"--user-data-dir={profile}",
         f"--print-to-pdf={out_pdf}", Path(html_path).as_uri()],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        last = -1
        for _ in range(60):  # up to ~30s
            if proc.poll() is not None:
                break
            if out_pdf.exists():
                sz = out_pdf.stat().st_size
                if sz > 0 and sz == last:  # size stable across two polls => done
                    break
                last = sz
            time.sleep(0.5)
        if out_pdf.exists() and out_pdf.stat().st_size > 1024:
            print(f"  OK  {md_rel}  ->  {out_pdf.relative_to(REPO)}  ({out_pdf.stat().st_size // 1024} KB)")
        else:
            print(f"  FAIL {md_rel}: no PDF produced")
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        os.unlink(html_path)
        shutil.rmtree(profile, ignore_errors=True)


def main():
    browser = find_browser()
    print(f"Rendering with: {browser}\n")
    targets = DOCS
    if len(sys.argv) > 1:  # allow rendering a single doc: pass a path substring
        targets = [d for d in DOCS if sys.argv[1].lower() in d[0].lower()]
    for md_rel, title in targets:
        render(md_rel, title, browser)
    print("\nDone.")


if __name__ == "__main__":
    main()
