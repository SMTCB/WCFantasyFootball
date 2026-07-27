#!/usr/bin/env python3
"""Regenerate BACKLOG.html from BACKLOG.md.

Run this after any edit to BACKLOG.md so the two files stay in sync
(see the maintenance note near the top of BACKLOG.md).

Usage:
    python3 scripts/generate_backlog_html.py
"""
import re
import html
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
MD_PATH = ROOT / "BACKLOG.md"
HTML_PATH = ROOT / "BACKLOG.html"

TYPE_MAP = {
    "FEATURE": "feature",
    "BUG": "bug",
    "TECH DEBT": "techdebt",
    "DOCS": "docs",
    "BUSINESS": "business",
}

# ---------------------------------------------------------------------------
# Tiny markdown -> HTML converter, scoped to the subset BACKLOG.md actually
# uses (headers, bold, inline code, links, strikethrough, lists, tables,
# fenced code blocks, blockquotes, hr, paragraphs).
# ---------------------------------------------------------------------------

def inline_md(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"~~(.+?)~~", r"<del>\1</del>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    return text


def render_table(rows):
    if len(rows) < 2:
        return ""
    header = [c.strip() for c in rows[0].strip("|").split("|")]
    body_rows = rows[2:]
    out = ['<div class="md-table-wrap"><table class="md-table"><thead><tr>']
    for h in header:
        out.append(f"<th>{inline_md(h)}</th>")
    out.append("</tr></thead><tbody>")
    for r in body_rows:
        cells = [c.strip() for c in r.strip("|").split("|")]
        out.append("<tr>")
        for c in cells:
            out.append(f"<td>{inline_md(c)}</td>")
        out.append("</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


def markdown_to_html(md_text):
    lines = md_text.split("\n")
    out = []
    i = 0
    para_buf = []
    list_stack = []  # list of (indent, tag)

    def flush_para():
        if para_buf:
            out.append(f"<p>{inline_md(' '.join(para_buf))}</p>")
            para_buf.clear()

    def close_lists(to_indent=-1):
        while list_stack and list_stack[-1][0] > to_indent:
            out.append(f"</{list_stack[-1][1]}>")
            list_stack.pop()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_para()
            close_lists()
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            out.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
            i += 1
            continue

        if re.match(r"^-{3,}\s*$", stripped):
            flush_para()
            close_lists()
            out.append("<hr>")
            i += 1
            continue

        if stripped.startswith("#### "):
            flush_para()
            close_lists()
            out.append(f"<h5>{inline_md(stripped[5:])}</h5>")
            i += 1
            continue
        if stripped.startswith("### "):
            flush_para()
            close_lists()
            out.append(f"<h4>{inline_md(stripped[4:])}</h4>")
            i += 1
            continue

        if stripped.startswith("> "):
            flush_para()
            close_lists()
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip()[1:].strip())
                i += 1
            out.append(f"<blockquote>{inline_md(' '.join(quote_lines))}</blockquote>")
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?\s*-{2,}", lines[i + 1].strip()):
            flush_para()
            close_lists()
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            out.append(render_table(table_lines))
            continue

        m_ol = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        m_ul = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        if m_ol or m_ul:
            flush_para()
            indent = len(m_ol.group(1)) if m_ol else len(m_ul.group(1))
            tag = "ol" if m_ol else "ul"
            content = m_ol.group(3) if m_ol else m_ul.group(2)
            if not list_stack or list_stack[-1][0] < indent:
                out.append(f"<{tag}>")
                list_stack.append((indent, tag))
            elif list_stack[-1][0] > indent:
                close_lists(indent)
                if not list_stack or list_stack[-1][0] < indent:
                    out.append(f"<{tag}>")
                    list_stack.append((indent, tag))
            out.append(f"<li>{inline_md(content)}</li>")
            i += 1
            continue

        if stripped == "":
            flush_para()
            close_lists()
            i += 1
            continue

        para_buf.append(stripped)
        i += 1

    flush_para()
    close_lists()
    return "\n".join(out)


# ---------------------------------------------------------------------------
# BACKLOG.md structural parsing
# ---------------------------------------------------------------------------

def extract_type_tag(item_text):
    m = re.search(r"\[([A-Z ]+)\]", item_text)
    if m:
        raw = m.group(1).strip()
        return raw, TYPE_MAP.get(raw, "other")
    return None, "other"


def parse_open_table(table_lines):
    """Parse a `| # | Item | Effort | Notes |` markdown table into row dicts."""
    rows = []
    for line in table_lines[2:]:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        item_id, item, effort, notes = cells[0], cells[1], cells[2], cells[3]
        resolved = item.startswith("~~") or item_id.startswith("~~")
        type_label, type_class = extract_type_tag(item)
        title = re.sub(r"^\*\*|\*\*$", "", re.sub(r"~~", "", item)).strip()
        title = re.sub(r"^\[[A-Z ]+\]\s*", "", title)
        rows.append({
            "id": item_id.replace("~~", "").strip(),
            "title": title,
            "effort": effort,
            "notes": notes,
            "resolved": resolved,
            "type_label": type_label,
            "type_class": type_class,
        })
    return rows


def parse_open_section(body):
    """Split a body into ### priority subsections, each with a table, plus
    any #### detail subsections (returned separately, keyed by id prefix)."""
    priorities = []
    detail_blocks = {}
    intro_lines = []

    # Split off #### detail blocks first (they trail the priority tables).
    parts = re.split(r"(?m)^#### ", body)
    main_body = parts[0]
    for chunk in parts[1:]:
        head_line, _, rest = chunk.partition("\n")
        detail_blocks[head_line.strip()] = rest.strip("\n")

    lines = main_body.split("\n")
    current_priority = None
    current_table = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^### (P\d[^\n]*)", line.strip())
        if m:
            if current_priority is not None:
                priorities.append((current_priority, parse_open_table(current_table)))
            current_priority = m.group(1).strip()
            current_table = []
            i += 1
            continue
        if current_priority is not None and line.strip().startswith("|"):
            current_table.append(line)
        elif current_priority is None:
            intro_lines.append(line)
        i += 1
    if current_priority is not None:
        priorities.append((current_priority, parse_open_table(current_table)))

    intro_html = markdown_to_html("\n".join(intro_lines))
    return intro_html, priorities, detail_blocks


def parse_backlog(md_text):
    lines = md_text.split("\n")
    # Preamble (before first "## ")
    first_h2 = next(idx for idx, l in enumerate(lines) if l.startswith("## "))
    preamble = "\n".join(lines[:first_h2])

    body_text = "\n".join(lines[first_h2:])
    raw_sections = re.split(r"(?m)^(## .+)$", body_text)
    # raw_sections[0] is empty (split starts right at a match); pairs follow
    sections = []
    it = iter(raw_sections[1:])
    for heading, content in zip(it, it):
        sections.append((heading[3:].strip(), content))

    open_items_sections = []
    history_entries = []

    for heading, content in sections:
        if heading.startswith("🌐") or heading.startswith("🚀 Open Backlog"):
            intro_html, priorities, detail_blocks = parse_open_section(content)
            open_items_sections.append({
                "heading": heading,
                "intro_html": intro_html,
                "priorities": priorities,
                "detail_blocks": detail_blocks,
            })
            continue

        # Everything else is treated as a history entry.
        # Convention: "<emoji> Title (date) — PR/migration refs". Titles can
        # themselves contain an em dash, so only the LAST " — " in the
        # heading (and only when it falls after the date, if any) is the
        # refs separator — never the first one found.
        date_match = re.search(r"\((\d{4}-\d{2}-\d{2}(?:/\d{2})?)\)", heading)
        date = date_match.group(1) if date_match else None
        last_dash_idx = heading.rfind(" — ")
        if last_dash_idx != -1 and (not date_match or last_dash_idx >= date_match.end()):
            refs = heading[last_dash_idx + 3:].strip()
            title = heading[:last_dash_idx].strip()
        else:
            refs = ""
            title = heading.strip()
        if date_match and date_match.start() <= len(title):
            title = title[:date_match.start()].rstrip(" —").strip()
        title = re.sub(r"^[^\w(]+", "", title).strip()

        if heading.startswith("✅"):
            kind = "done"
        elif heading.startswith("📊"):
            kind = "session"
        elif heading.startswith("🔍"):
            kind = "audit"
        elif heading.startswith("🚨"):
            kind = "audit"
        elif heading.startswith("🧹"):
            kind = "session"
        elif heading.startswith("🚀"):
            kind = "planning"
        else:
            kind = "other"

        history_entries.append({
            "heading": heading,
            "title": title,
            "date": date,
            "refs": refs,
            "kind": kind,
            "body_html": markdown_to_html(content),
            "search_text": (heading + " " + content).lower(),
        })

    return preamble, open_items_sections, history_entries


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

KIND_LABELS = {
    "done": ("SHIPPED", "k-done"),
    "session": ("SESSION LOG", "k-session"),
    "audit": ("AUDIT", "k-audit"),
    "planning": ("PLANNING SNAPSHOT", "k-planning"),
    "other": ("NOTE", "k-other"),
}


def render_open_row(row, section_slug, priority_slug):
    resolved_cls = " resolved" if row["resolved"] else ""
    type_badge = f'<span class="tbadge t-{row["type_class"]}">{html.escape(row["type_label"] or "—")}</span>' if row["type_label"] else ""
    detail_link = ""
    detail_key = row["id"]
    return f"""
      <div class="open-row{resolved_cls}" data-search="{html.escape((row['id']+' '+row['title']+' '+row['notes']).lower())}" data-priority="{priority_slug}" data-section="{section_slug}" data-id="{html.escape(row['id'])}">
        <div class="open-row-top">
          <span class="open-id">{html.escape(row['id'])}</span>
          {type_badge}
          <span class="open-title">{inline_md(row['title'])}</span>
          <span class="open-effort">{inline_md(row['effort'])}</span>
        </div>
        <div class="open-notes">{inline_md(row['notes'])}</div>
      </div>"""


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def render_open_items(open_items_sections):
    out = []
    for sec in open_items_sections:
        sec_slug = slugify(sec["heading"])[:40]
        out.append(f'<section class="open-section" id="sec-{sec_slug}">')
        out.append(f'<h2 class="open-section-title">{inline_md(sec["heading"])}</h2>')
        if sec["intro_html"].strip():
            out.append(f'<div class="open-intro">{sec["intro_html"]}</div>')
        for priority, rows in sec["priorities"]:
            pr_slug = slugify(priority)[:6]
            out.append(f'<div class="priority-block" data-priority-block="{pr_slug}">')
            out.append(f'<h3 class="priority-title pr-{pr_slug}">{inline_md(priority)}</h3>')
            out.append('<div class="open-rows">')
            for row in rows:
                out.append(render_open_row(row, sec_slug, pr_slug))
            out.append('</div></div>')
        if sec["detail_blocks"]:
            out.append('<div class="detail-blocks">')
            for key, detail_body in sec["detail_blocks"].items():
                out.append(f'<details class="detail-block" data-search="{html.escape(key.lower())}">')
                out.append(f'<summary>{inline_md(key)}</summary>')
                out.append(f'<div class="detail-body">{markdown_to_html(detail_body)}</div>')
                out.append('</details>')
            out.append('</div>')
        out.append('</section>')
    return "\n".join(out)


def render_history(history_entries):
    out = []
    for idx, e in enumerate(history_entries):
        label, cls = KIND_LABELS[e["kind"]]
        date_html = f'<span class="hist-date">{html.escape(e["date"])}</span>' if e["date"] else ""
        refs_html = f'<span class="hist-refs">{inline_md(e["refs"])}</span>' if e["refs"] else ""
        out.append(f"""
      <details class="hist-entry" data-kind="{e['kind']}" data-search="{html.escape(e['search_text'][:4000])}">
        <summary>
          <span class="hist-badge {cls}">{label}</span>
          {date_html}
          <span class="hist-title">{inline_md(e['title'])}</span>
          {refs_html}
        </summary>
        <div class="hist-body">{e['body_html']}</div>
      </details>""")
    return "\n".join(out)


def render_preamble_badges(preamble):
    badges = []
    if "LAUNCH READY" in preamble:
        badges.append('<span class="badge badge-green">LAUNCH READY (pilot)</span>')
    if "MAINTENANCE_MODE" in preamble:
        badges.append('<span class="badge badge-amber">SITE WALLED — MAINTENANCE MODE</span>')
    m = re.search(r"E2E Test Suite\*\*:\s*(.+?)(?:\n|$)", preamble)
    if m:
        badges.append(f'<span class="badge badge-blue">{html.escape(re.sub(r"[`*]", "", m.group(1))[:70])}</span>')
    return "\n".join(badges)


def render_priority_counts(open_items_sections):
    counts = {"p1": 0, "p2": 0, "p3": 0}
    for sec in open_items_sections:
        for priority, rows in sec["priorities"]:
            key = slugify(priority)[:2]
            live_rows = [r for r in rows if not r["resolved"]]
            if key in counts:
                counts[key] += len(live_rows)
    return counts


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forza Fantasy League — Backlog</title>
<style>
{css}
</style>
</head>
<body>
<header>
  <div class="header-left">
    <h1>Forza Fantasy League — Backlog</h1>
    <p>Generated from <code>BACKLOG.md</code> — {generated_at}. Do not hand-edit; re-run <code>scripts/generate_backlog_html.py</code>.</p>
    <div class="badge-bar">{badges}</div>
  </div>
  <div class="header-right">
    <div class="tabs">
      <button class="tab-btn active" data-tab="open">Open Items <span class="tab-count">{open_count}</span></button>
      <button class="tab-btn" data-tab="history">History <span class="tab-count">{history_count}</span></button>
    </div>
  </div>
</header>

<div class="controls">
  <div class="search-wrap">
    <span class="search-icon">&#128269;</span>
    <input id="search" type="text" placeholder="Search open items and history…">
  </div>
  <div class="filter-chips" id="open-chips">
    <span class="chip active" data-filter-priority="all">All priorities</span>
    <span class="chip" data-filter-priority="p1">P1 — HIGH ({p1_count})</span>
    <span class="chip" data-filter-priority="p2">P2 — MEDIUM ({p2_count})</span>
    <span class="chip" data-filter-priority="p3">P3 — LOW ({p3_count})</span>
  </div>
  <div class="filter-chips" id="history-chips" style="display:none">
    <span class="chip active" data-filter-kind="all">All history</span>
    <span class="chip" data-filter-kind="done">Shipped</span>
    <span class="chip" data-filter-kind="session">Session logs</span>
    <span class="chip" data-filter-kind="audit">Audits</span>
    <span class="chip" data-filter-kind="planning">Planning snapshots</span>
  </div>
  <span id="result-count"></span>
</div>

<div class="layout">
  <div class="sidebar" id="sidebar-open">
    <h3>Jump to</h3>
    {sidebar_open}
  </div>
  <div class="sidebar" id="sidebar-history" style="display:none">
    <h3>Filter</h3>
    <div class="sidebar-item" data-jump-kind="all">All entries<span class="sidebar-count">{history_count}</span></div>
    <div class="sidebar-item" data-jump-kind="done">Shipped work</div>
    <div class="sidebar-item" data-jump-kind="session">Session logs</div>
    <div class="sidebar-item" data-jump-kind="audit">Audits</div>
    <div class="sidebar-item" data-jump-kind="planning">Planning snapshots</div>
  </div>
  <div class="main">
    <div id="view-open" class="view">
      {open_items_html}
    </div>
    <div id="view-history" class="view" style="display:none">
      <p class="hist-hint">Newest first, exactly as they appear in BACKLOG.md. Click any row to expand its full write-up.</p>
      {history_html}
    </div>
  </div>
</div>

<script>
{js}
</script>
</body>
</html>
"""


def build_css():
    return """
  :root {
    --bg: #f5f4f0;
    --card: #ffffff;
    --shell: #18202e;
    --accent: #1a6fa8;
    --accent-light: #e8f3fb;
    --gold: #b8720e;
    --gold-light: #fdf3e4;
    --paper: #18202e;
    --text2: #64748b;
    --border: #e2e8f0;
    --danger: #b91c1c;
    --radius: 8px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--paper); min-height: 100vh; }

  header { background: var(--shell); color: white; padding: 20px 32px 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .header-left h1 { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
  .header-left p { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 2px; }
  .header-left code { background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; }
  .badge-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .badge { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 4px; }
  .badge-green { background: #166534; color: #dcfce7; }
  .badge-blue  { background: #1a6fa8; color: #e8f3fb; }
  .badge-amber { background: #92400e; color: #fef9ed; }

  .tabs { display: flex; gap: 6px; margin-top: 4px; }
  .tab-btn { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .tab-btn.active { background: var(--gold); color: #1a1200; border-color: var(--gold); }
  .tab-count { background: rgba(0,0,0,0.15); border-radius: 10px; padding: 1px 6px; font-size: 10px; }
  .tab-btn.active .tab-count { background: rgba(0,0,0,0.2); }

  .controls { background: var(--card); border-bottom: 1px solid var(--border); padding: 10px 32px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .search-wrap { position: relative; flex: 1; min-width: 220px; }
  .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text2); font-size: 13px; pointer-events: none; }
  #search { width: 100%; padding: 7px 12px 7px 32px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 13px; background: var(--bg); color: var(--paper); outline: none; }
  #search:focus { border-color: var(--accent); }
  .filter-chips { display: flex; gap: 5px; flex-wrap: wrap; }
  .chip { padding: 4px 11px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; border: 1px solid var(--border); background: white; color: var(--text2); cursor: pointer; transition: all 0.1s; white-space: nowrap; user-select: none; }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip.active { background: var(--accent); color: white; border-color: var(--accent); }
  #result-count { font-size: 11px; color: var(--text2); white-space: nowrap; margin-left: 4px; }

  .layout { display: flex; min-height: calc(100vh - 130px); }
  .sidebar { width: 220px; min-width: 220px; background: white; border-right: 1px solid var(--border); padding: 12px 0; position: sticky; top: 49px; height: calc(100vh - 49px); overflow-y: auto; flex-shrink: 0; }
  .sidebar h3 { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--text2); padding: 10px 14px 4px; text-transform: uppercase; }
  .sidebar-item { padding: 7px 14px; font-size: 12px; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 6px; border-left: 2px solid transparent; transition: all 0.1s; user-select: none; }
  .sidebar-item:hover { background: var(--accent-light); color: var(--accent); border-left-color: var(--accent); }
  .sidebar-item.active { background: var(--accent-light); color: var(--accent); border-left-color: var(--accent); font-weight: 600; }
  .sidebar-count { margin-left: auto; font-size: 10px; background: #f1f5f9; border-radius: 10px; padding: 1px 6px; color: var(--text2); min-width: 20px; text-align: center; }

  .main { flex: 1; padding: 22px 28px; min-width: 0; max-width: 980px; }

  .open-section { margin-bottom: 32px; }
  .open-section-title { font-size: 16px; font-weight: 800; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid var(--shell); }
  .open-intro { font-size: 12.5px; color: var(--text2); background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; margin-bottom: 16px; line-height: 1.6; }
  .open-intro p { margin-bottom: 6px; }
  .open-intro blockquote { border-left: 3px solid var(--gold); padding-left: 10px; color: #92400e; margin: 8px 0; }

  .priority-block { margin-bottom: 18px; }
  .priority-title { font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 10px; border-radius: 5px; display: inline-block; margin-bottom: 8px; }
  .pr-p1 { background: #fee2e2; color: #991b1b; }
  .pr-p2 { background: #fef3c7; color: #92400e; }
  .pr-p3 { background: #e0f2fe; color: #075985; }

  .open-rows { display: flex; flex-direction: column; gap: 6px; }
  .open-row { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 9px 12px; }
  .open-row.resolved { opacity: 0.55; background: #f8fafc; }
  .open-row-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .open-id { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: var(--accent); background: var(--accent-light); padding: 1px 6px; border-radius: 4px; }
  .open-title { font-size: 13px; font-weight: 600; flex: 1; min-width: 160px; }
  .open-effort { font-size: 11px; color: var(--text2); font-style: italic; white-space: nowrap; }
  .open-notes { font-size: 12px; color: #475569; margin-top: 4px; line-height: 1.55; }
  .open-notes code { background: #f1f5f9; padding: 0 4px; border-radius: 3px; font-size: 11px; }

  .tbadge { font-size: 9px; font-weight: 800; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .t-feature { background: #dcfce7; color: #166534; }
  .t-bug { background: #fee2e2; color: #991b1b; }
  .t-techdebt { background: #e0e7ff; color: #3730a3; }
  .t-docs { background: #f1f5f9; color: #475569; }
  .t-business { background: var(--gold-light); color: var(--gold); }
  .t-other { background: #f1f5f9; color: #475569; }

  .detail-blocks { margin-top: 14px; }
  .detail-block { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; padding: 4px 4px; }
  .detail-block summary { cursor: pointer; font-size: 12.5px; font-weight: 700; padding: 8px 10px; color: var(--shell); }
  .detail-block summary:hover { color: var(--accent); }
  .detail-body { padding: 4px 16px 14px; font-size: 12.5px; line-height: 1.65; color: #334155; }
  .detail-body h4 { font-size: 13px; margin: 10px 0 4px; color: var(--shell); }
  .detail-body h5 { font-size: 12.5px; margin: 8px 0 4px; color: var(--accent); }
  .detail-body ul, .detail-body ol { margin: 4px 0 8px 20px; }
  .detail-body li { margin-bottom: 3px; }
  .detail-body code { background: #f1f5f9; padding: 0 4px; border-radius: 3px; font-size: 11.5px; }
  .detail-body pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-size: 11.5px; margin: 8px 0; }
  .detail-body pre code { background: none; color: inherit; padding: 0; }
  .detail-body p { margin-bottom: 8px; }

  .hist-hint { font-size: 12px; color: var(--text2); margin-bottom: 14px; }
  .hist-entry { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 7px; }
  .hist-entry summary { cursor: pointer; padding: 10px 14px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; list-style: none; }
  .hist-entry summary::-webkit-details-marker { display: none; }
  .hist-entry summary::before { content: '▸'; color: var(--text2); font-size: 10px; margin-right: 2px; }
  .hist-entry[open] summary::before { content: '▾'; }
  .hist-badge { font-size: 9px; font-weight: 800; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
  .k-done { background: #dcfce7; color: #166534; }
  .k-session { background: #e0f2fe; color: #075985; }
  .k-audit { background: #fee2e2; color: #991b1b; }
  .k-planning { background: #f1f5f9; color: #475569; }
  .k-other { background: #f1f5f9; color: #475569; }
  .hist-date { font-size: 11px; color: var(--text2); font-family: 'JetBrains Mono', monospace; }
  .hist-title { font-size: 13px; font-weight: 600; flex: 1; min-width: 160px; }
  .hist-refs { font-size: 11px; color: var(--gold); font-weight: 600; }
  .hist-body { padding: 2px 18px 16px 30px; font-size: 12.5px; line-height: 1.65; color: #334155; border-top: 1px solid var(--border); }
  .hist-body h4 { font-size: 13px; margin: 10px 0 4px; color: var(--shell); }
  .hist-body h5 { font-size: 12.5px; margin: 8px 0 4px; color: var(--accent); }
  .hist-body ul, .hist-body ol { margin: 6px 0 8px 20px; }
  .hist-body li { margin-bottom: 3px; }
  .hist-body code { background: #f1f5f9; padding: 0 4px; border-radius: 3px; font-size: 11.5px; }
  .hist-body pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-size: 11.5px; margin: 8px 0; }
  .hist-body pre code { background: none; color: inherit; padding: 0; }
  .hist-body p { margin-bottom: 8px; }
  .md-table-wrap { overflow-x: auto; margin: 8px 0; }
  .md-table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
  .md-table th, .md-table td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; vertical-align: top; }
  .md-table th { background: #f8fafc; font-weight: 700; }

  .hidden { display: none !important; }

  @media (max-width: 720px) {
    .sidebar { display: none !important; }
    .main { padding: 16px; }
    header { padding: 16px; }
  }
"""


def build_js():
    return """
document.addEventListener('DOMContentLoaded', () => {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const viewOpen = document.getElementById('view-open');
  const viewHistory = document.getElementById('view-history');
  const sidebarOpen = document.getElementById('sidebar-open');
  const sidebarHistory = document.getElementById('sidebar-history');
  const openChips = document.getElementById('open-chips');
  const historyChips = document.getElementById('history-chips');
  const search = document.getElementById('search');
  const resultCount = document.getElementById('result-count');
  let activeTab = 'open';
  let activePriority = 'all';
  let activeKind = 'all';

  tabBtns.forEach(btn => btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    viewOpen.style.display = activeTab === 'open' ? '' : 'none';
    viewHistory.style.display = activeTab === 'history' ? '' : 'none';
    sidebarOpen.style.display = activeTab === 'open' ? '' : 'none';
    sidebarHistory.style.display = activeTab === 'history' ? '' : 'none';
    openChips.style.display = activeTab === 'open' ? '' : 'none';
    historyChips.style.display = activeTab === 'history' ? '' : 'none';
    applyFilters();
  }));

  openChips.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    openChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activePriority = chip.dataset.filterPriority;
    applyFilters();
  }));

  historyChips.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    historyChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeKind = chip.dataset.filterKind;
    applyFilters();
  }));

  document.querySelectorAll('[data-jump-kind]').forEach(el => el.addEventListener('click', () => {
    document.querySelectorAll('[data-jump-kind]').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    activeKind = el.dataset.jumpKind;
    historyChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filterKind === activeKind));
    applyFilters();
  }));

  document.querySelectorAll('[data-jump-to]').forEach(el => el.addEventListener('click', () => {
    const target = document.getElementById(el.dataset.jumpTo);
    if (target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
  }));

  function norm(s) { return (s || '').toLowerCase(); }

  function applyFilters() {
    const q = norm(search.value);
    let visible = 0, total = 0;
    if (activeTab === 'open') {
      document.querySelectorAll('.open-row').forEach(row => {
        total++;
        const matchesQ = !q || row.dataset.search.includes(q);
        const matchesP = activePriority === 'all' || row.dataset.priority === activePriority;
        const show = matchesQ && matchesP;
        row.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      document.querySelectorAll('.priority-block').forEach(block => {
        const anyVisible = block.querySelectorAll('.open-row:not(.hidden)').length > 0;
        block.classList.toggle('hidden', !anyVisible);
      });
      document.querySelectorAll('.detail-block').forEach(d => {
        d.classList.toggle('hidden', !!q && !d.dataset.search.includes(q));
      });
    } else {
      document.querySelectorAll('.hist-entry').forEach(entry => {
        total++;
        const matchesQ = !q || entry.dataset.search.includes(q);
        const matchesK = activeKind === 'all' || entry.dataset.kind === activeKind;
        const show = matchesQ && matchesK;
        entry.classList.toggle('hidden', !show);
        if (show) visible++;
      });
    }
    resultCount.textContent = q || (activeTab === 'open' ? activePriority !== 'all' : activeKind !== 'all')
      ? visible + ' / ' + total + ' shown'
      : total + ' items';
  }

  search.addEventListener('input', applyFilters);
  applyFilters();
});
"""


def main():
    md_text = MD_PATH.read_text(encoding="utf-8")
    preamble, open_items_sections, history_entries = parse_backlog(md_text)

    counts = render_priority_counts(open_items_sections)
    total_open = sum(counts.values())

    sidebar_open_items = []
    for sec in open_items_sections:
        sec_slug = slugify(sec["heading"])[:40]
        label = re.sub(r"^[^\w]+", "", sec["heading"]).split("(")[0].strip()
        sidebar_open_items.append(f'<div class="sidebar-item" data-jump-to="sec-{sec_slug}">{html.escape(label)}</div>')

    page = PAGE_TEMPLATE.format(
        css=build_css(),
        js=build_js(),
        generated_at=datetime.now().strftime("%Y-%m-%d"),
        badges=render_preamble_badges(preamble),
        open_count=total_open,
        history_count=len(history_entries),
        p1_count=counts.get("p1", 0),
        p2_count=counts.get("p2", 0),
        p3_count=counts.get("p3", 0),
        sidebar_open="\n".join(sidebar_open_items),
        open_items_html=render_open_items(open_items_sections),
        history_html=render_history(history_entries),
    )

    HTML_PATH.write_text(page, encoding="utf-8")
    print(f"Wrote {HTML_PATH} ({len(page):,} bytes) — {total_open} open items, {len(history_entries)} history entries.")


if __name__ == "__main__":
    sys.exit(main())
