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

PRIORITY_COLORS = {"p0": "#7a1414", "p1": "#b23b3b", "p2": "#b8720e", "p3": "#5b7285"}
PRIORITY_COLOR_DEFAULT = "#5b7285"

KIND_LABELS = {
    "done": ("SHIPPED", "k-done"),
    "resolved": ("RESOLVED", "k-done"),
    "session": ("SESSION LOG", "k-session"),
    "audit": ("AUDIT", "k-audit"),
    "planning": ("PLANNING SNAPSHOT", "k-planning"),
    "other": ("NOTE", "k-other"),
}
KIND_COLORS = {
    "done": "#1f7a4d",
    "resolved": "#1f7a4d",
    "session": "#1a6fa8",
    "audit": "#b23b3b",
    "planning": "#5b7285",
    "other": "#5b7285",
}
KIND_GROUP_ORDER = ["done", "resolved", "session", "audit", "planning", "other"]
KIND_GROUP_LABELS = {
    "done": "Shipped",
    "resolved": "Resolved backlog items",
    "session": "Session logs",
    "audit": "Audits",
    "planning": "Planning snapshots",
    "other": "Notes",
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


def strip_tags(s):
    return re.sub(r"<[^>]+>", " ", s or "")


def make_summary(text, limit=170):
    text = re.sub(r"\s+", " ", html.unescape(text or "")).strip()
    if len(text) > limit:
        cut = text[:limit].rsplit(" ", 1)[0]
        text = cut + "…"
    return text


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
            "notes": re.sub(r"~~", "", notes).strip(),
            "resolved": resolved,
            "type_label": type_label,
            "type_class": type_class,
        })
    return rows


def parse_open_section(body):
    """Split a body into ### priority subsections, each with a table, plus
    any #### detail subsections (returned separately, keyed by heading text).

    #### detail blocks can appear *between* ### priority tables (e.g. a
    detail block for a P2 item, followed by a ### P3 table) — a detail
    block must end at the next #### OR ### heading, not just the next ####,
    or it silently swallows every priority section that follows it."""
    priorities = []
    detail_blocks = {}
    intro_lines = []

    current_priority = None
    current_table = []
    current_detail_heading = None
    current_detail_lines = []

    def flush_detail():
        if current_detail_heading is not None:
            detail_blocks[current_detail_heading] = "\n".join(current_detail_lines).strip("\n")

    def flush_priority():
        if current_priority is not None:
            priorities.append((current_priority, parse_open_table(current_table)))

    for line in body.split("\n"):
        stripped = line.strip()
        m4 = re.match(r"^#### (.+)", stripped)
        m3 = re.match(r"^### (P\d[^\n]*)", stripped)
        if m4:
            flush_detail()
            current_detail_heading = m4.group(1).strip()
            current_detail_lines = []
            continue
        if m3:
            flush_detail()
            current_detail_heading = None
            current_detail_lines = []
            flush_priority()
            current_priority = m3.group(1).strip()
            current_table = []
            continue
        if current_detail_heading is not None:
            current_detail_lines.append(line)
        elif current_priority is not None and stripped.startswith("|"):
            current_table.append(line)
        elif current_priority is None:
            intro_lines.append(line)
    flush_detail()
    flush_priority()

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
        if heading.startswith("\U0001F310") or heading.startswith("\U0001F680 Open Backlog"):
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
        elif heading.startswith("\U0001F4CA"):
            kind = "session"
        elif heading.startswith("\U0001F50D"):
            kind = "audit"
        elif heading.startswith("\U0001F6A8"):
            kind = "audit"
        elif heading.startswith("\U0001F9F9"):
            kind = "session"
        elif heading.startswith("\U0001F680"):
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
# Unified "pocket jira" item model — every open-backlog row AND every history
# entry gets normalized onto one schema so they can render as one card grid
# with one common detail-drawer structure (Description / Why it's necessary /
# Where it came from / Date / Technical solution). Fields that genuinely
# don't exist for a given source shape render as an honest "—" rather than
# being fabricated.
# ---------------------------------------------------------------------------

def section_label_for(heading):
    return re.sub(r"^[^\w]+", "", heading).split("(")[0].strip()


def priority_slug_and_label(raw_priority):
    m = re.match(r"P(\d)", raw_priority.strip())
    slug = f"p{m.group(1)}" if m else "p9"
    label = re.sub(r"\s*\([^)]*\)\s*$", "", raw_priority).strip()
    return slug, label


def find_detail_body(detail_blocks, item_id):
    for key, body in detail_blocks.items():
        first_token = key.split()[0] if key.split() else ""
        if first_token == item_id:
            return body
    return None


def build_unified_items(open_items_sections, history_entries):
    open_out = []
    closed_out = []
    uid_counter = [0]

    def next_uid():
        uid_counter[0] += 1
        return f"i{uid_counter[0]}"

    for sec in open_items_sections:
        sec_label = section_label_for(sec["heading"])
        for raw_priority, rows in sec["priorities"]:
            pr_slug, pr_label = priority_slug_and_label(raw_priority)
            for row in rows:
                detail_body = find_detail_body(sec["detail_blocks"], row["id"])
                technical_html = markdown_to_html(detail_body) if detail_body else None
                why_html = f"<p>{inline_md(row['notes'])}</p>" if row["notes"] else None
                description_html = f"<p>{inline_md(row['title'])}</p>"
                summary_text = row["notes"] or row["title"]
                search_text = " ".join([row["id"], row["title"], row["notes"], sec_label, pr_label]).lower()

                item = {
                    "uid": next_uid(),
                    "title": row["title"],
                    "summary_text": summary_text,
                    "id_label": row["id"],
                    "effort": row["effort"],
                    "type_label": row["type_label"],
                    "type_class": row["type_class"],
                    "date": None,
                    "refs": None,
                    "description_html": description_html,
                    "why_html": why_html,
                    "technical_html": technical_html,
                    "search_text": search_text,
                }

                if row["resolved"]:
                    item.update({
                        "status": "closed",
                        "kind": "resolved",
                        "kind_label": KIND_LABELS["resolved"][0],
                        "kind_class": KIND_LABELS["resolved"][1],
                        "priority": None,
                        "where_from": f"Resolved backlog item · {sec_label} · {pr_label}",
                    })
                    closed_out.append(item)
                else:
                    item.update({
                        "status": "open",
                        "priority": pr_slug,
                        "priority_label": pr_label,
                        "where_from": f"{sec_label} · {pr_label}",
                    })
                    open_out.append(item)

    for e in history_entries:
        label, cls = KIND_LABELS[e["kind"]]
        summary_text = make_summary(strip_tags(e["body_html"]))
        where_from = label if not e["refs"] else f"{label} · {e['refs']}"
        item = {
            "uid": next_uid(),
            "status": "closed",
            "title": e["title"],
            "summary_text": summary_text,
            "id_label": None,
            "effort": None,
            "type_label": None,
            "type_class": None,
            "priority": None,
            "kind": e["kind"],
            "kind_label": label,
            "kind_class": cls,
            "date": e["date"],
            "refs": e["refs"],
            "where_from": where_from,
            "description_html": f"<p>{inline_md(summary_text)}</p>" if summary_text else "<p class=\"muted\">No summary available.</p>",
            "why_html": None,
            "technical_html": e["body_html"],
            "search_text": e["search_text"],
        }
        closed_out.append(item)

    return open_out, closed_out


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

def esc(s):
    return html.escape(s or "", quote=True)


def render_card(item):
    status = item["status"]
    if status == "open":
        tab_color = PRIORITY_COLORS.get(item["priority"], PRIORITY_COLOR_DEFAULT)
        top_badge = f'<span class="badge-mini pr-{esc(item["priority"])}">{esc(item["priority_label"])}</span>'
        stamp_attr = ""
        priority_attr = item["priority"]
        kind_attr = "none"
    else:
        tab_color = KIND_COLORS.get(item["kind"], PRIORITY_COLOR_DEFAULT)
        top_badge = f'<span class="badge-mini {item["kind_class"]}">{esc(item["kind_label"])}</span>'
        stamp_attr = f' data-stamp="{esc(item["kind_label"])}"'
        priority_attr = "none"
        kind_attr = item["kind"]

    type_html = f'<span class="type-tag t-{item["type_class"]}">{esc(item["type_label"])}</span>' if item.get("type_label") else ""

    foot_bits = []
    if item.get("id_label"):
        foot_bits.append(f'<span class="foot-id">{esc(item["id_label"])}</span>')
    if item.get("effort"):
        foot_bits.append(f'<span class="foot-effort">{inline_md(item["effort"])}</span>')
    if item.get("date"):
        foot_bits.append(f'<span class="foot-date">{esc(item["date"])}</span>')
    if item.get("refs"):
        foot_bits.append(f'<span class="foot-refs">{inline_md(item["refs"])}</span>')
    foot_html = "".join(foot_bits)

    detail_html = render_detail(item, top_badge, type_html)

    return f"""
      <article class="card" data-status="{status}" data-priority="{priority_attr}" data-kind="{kind_attr}" data-search="{esc(item['search_text'][:2000])}" style="--tab-color:{tab_color}" tabindex="0"{stamp_attr}>
        <div class="card-top">{top_badge}{type_html}</div>
        <h3 class="card-title">{inline_md(item['title'])}</h3>
        <p class="card-summary">{inline_md(item['summary_text'])}</p>
        <div class="card-foot">{foot_html}</div>
        <template>{detail_html}</template>
      </article>"""


def render_detail(item, top_badge, type_html):
    date_html = f'<p>{esc(item["date"])}</p>' if item.get("date") else '<p class="muted">Not dated.</p>'
    why_html = item.get("why_html") or '<p class="muted">Not recorded for this item.</p>'
    technical_html = item.get("technical_html") or '<p class="muted">No implementation write-up recorded.</p>'
    return f"""
      <div class="drawer-badges">{top_badge}{type_html}</div>
      <h2 class="drawer-title">{inline_md(item['title'])}</h2>
      <dl class="drawer-fields">
        <div class="field"><dt>Description</dt><dd>{item['description_html']}</dd></div>
        <div class="field"><dt>Why it's necessary</dt><dd>{why_html}</dd></div>
        <div class="field"><dt>Where it came from</dt><dd><p>{inline_md(item['where_from'])}</p></dd></div>
        <div class="field"><dt>Date</dt><dd>{date_html}</dd></div>
        <div class="field"><dt>Technical solution</dt><dd>{technical_html}</dd></div>
      </dl>"""


def render_group(slug, label, count, color, cards_html):
    if count == 0:
        return ""
    return f"""
    <section class="item-group" id="group-{slug}" data-group="{slug}">
      <h2 class="group-title" style="--tab-color:{color}">{esc(label)} <span class="group-count">{count}</span></h2>
      <div class="card-grid">{cards_html}</div>
    </section>"""


def render_preamble_badges(preamble):
    badges = []
    # Match the status *line* (a bold heading starting with a traffic-light emoji), never a
    # bare substring — the preamble legitimately mentions past statuses in prose
    # ("was 🟢 LAUNCH READY"), which a substring test reads as the current one.
    status = re.search(r"^\*\*(🟢|🟠|🔴)\s*(.+?)\*\*", preamble, re.MULTILINE)
    if status:
        light, text = status.group(1), re.sub(r"[`*]", "", status.group(2)).strip()
        color = {"🟢": "badge-green", "🟠": "badge-amber", "🔴": "badge-red"}[light]
        badges.append(f'<span class="badge {color}">{html.escape(text[:70])}</span>')
    if "MAINTENANCE_MODE" in preamble:
        badges.append('<span class="badge badge-amber">SITE WALLED — MAINTENANCE MODE</span>')
    m = re.search(r"E2E Test Suite\*\*:\s*(.+?)(?:\n|$)", preamble)
    if m:
        badges.append(f'<span class="badge badge-blue">{html.escape(re.sub(r"[`*]", "", m.group(1))[:70])}</span>')
    return "\n".join(badges)


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
    <div class="totals">
      <div class="total-pill"><strong>{open_count}</strong><span>open</span></div>
      <div class="total-pill"><strong>{closed_count}</strong><span>closed</span></div>
    </div>
  </div>
</header>

<div class="controls">
  <div class="search-wrap">
    <span class="search-icon">&#128269;</span>
    <input id="search" type="text" placeholder="Search all items…">
  </div>
  <div class="filter-chips" id="open-chips">
    <span class="chip active" data-filter-priority="all">All priorities</span>
    {priority_chips}
  </div>
  <div class="filter-chips" id="closed-chips" style="display:none">
    <span class="chip active" data-filter-kind="all">All closed</span>
    {kind_chips}
  </div>
  <span id="result-count"></span>
</div>

<div class="layout">
  <nav class="sidebar">
    <div class="status-toggle">
      <button class="status-btn active" data-status="open">Open <span class="status-count">{open_count}</span></button>
      <button class="status-btn" data-status="closed">Closed <span class="status-count">{closed_count}</span></button>
    </div>
    <div class="sidebar-group" id="sidebar-open">
      <h3>Jump to priority</h3>
      {sidebar_open}
    </div>
    <div class="sidebar-group" id="sidebar-closed" style="display:none">
      <h3>Jump to category</h3>
      {sidebar_closed}
    </div>
  </nav>
  <main class="main">
    <div id="view-open" class="grid-view">
      {open_groups_html}
    </div>
    <div id="view-closed" class="grid-view" style="display:none">
      {closed_groups_html}
    </div>
    <div class="no-results" id="no-results">
      <h3>No items found</h3>
      <p>Try a different search term or clear the active filter.</p>
    </div>
  </main>
</div>

<div class="drawer-backdrop" id="drawer-backdrop"></div>
<aside class="drawer" id="drawer">
  <button class="drawer-close" id="drawer-close" aria-label="Close">&times;</button>
  <div class="drawer-body" id="drawer-body"></div>
</aside>

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
    --radius: 10px;
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
  .badge-red   { background: #991b1b; color: #fee2e2; }

  .totals { display: flex; gap: 8px; }
  .total-pill { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 6px 14px; text-align: center; min-width: 64px; }
  .total-pill strong { display: block; font-size: 17px; font-weight: 800; }
  .total-pill span { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); }

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
  .sidebar { width: 230px; min-width: 230px; background: white; border-right: 1px solid var(--border); padding: 12px 0; position: sticky; top: 49px; height: calc(100vh - 49px); overflow-y: auto; flex-shrink: 0; }
  .status-toggle { display: flex; gap: 4px; padding: 0 14px 12px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
  .status-btn { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text2); font-size: 12px; font-weight: 700; padding: 8px 6px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .status-btn .status-count { font-size: 14px; font-weight: 800; }
  .status-btn.active { background: var(--shell); color: white; border-color: var(--shell); }
  .sidebar h3 { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--text2); padding: 10px 14px 4px; text-transform: uppercase; }
  .sidebar-item { padding: 7px 14px; font-size: 12px; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 8px; border-left: 3px solid transparent; transition: all 0.1s; user-select: none; }
  .sidebar-item .swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; background: var(--tab-color, var(--text2)); }
  .sidebar-item:hover { background: var(--accent-light); color: var(--accent); }
  .sidebar-item.active { background: var(--accent-light); color: var(--accent); border-left-color: var(--accent); font-weight: 600; }
  .sidebar-count { margin-left: auto; font-size: 10px; background: #f1f5f9; border-radius: 10px; padding: 1px 6px; color: var(--text2); min-width: 20px; text-align: center; }

  .main { flex: 1; padding: 22px 28px; min-width: 0; }

  .item-group { margin-bottom: 28px; }
  .group-title { font-size: 13px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; color: var(--shell); padding-left: 12px; border-left: 4px solid var(--tab-color, var(--accent)); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .group-count { font-size: 11px; font-weight: 700; color: white; background: var(--tab-color, var(--text2)); border-radius: 10px; padding: 1px 8px; }

  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
  .card { position: relative; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px 10px; cursor: pointer; overflow: hidden; transition: transform 0.12s, box-shadow 0.12s; }
  .card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--tab-color, var(--text2)); }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(24,32,46,0.1); border-color: var(--tab-color, var(--accent)); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card[data-status="closed"]::after { content: attr(data-stamp); position: absolute; top: 10px; right: -30px; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; color: var(--tab-color, var(--text2)); opacity: 0.35; transform: rotate(28deg); white-space: nowrap; pointer-events: none; }
  .card-top { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; padding-right: 34px; }
  .badge-mini { font-size: 9px; font-weight: 800; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; }
  .pr-p0 { background: #fee2e2; color: #7a1414; }
  .pr-p1 { background: #fee2e2; color: #991b1b; }
  .pr-p2 { background: #fef3c7; color: #92400e; }
  .pr-p3 { background: #e0f2fe; color: #075985; }
  .k-done { background: #dcfce7; color: #166534; }
  .k-session { background: #e0f2fe; color: #075985; }
  .k-audit { background: #fee2e2; color: #991b1b; }
  .k-planning { background: #f1f5f9; color: #475569; }
  .k-other { background: #f1f5f9; color: #475569; }
  .card-title { font-size: 13.5px; font-weight: 700; line-height: 1.35; margin-bottom: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card-summary { font-size: 11.5px; color: #475569; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px; min-height: 17px; }
  .card-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 10.5px; color: var(--text2); }
  .foot-id { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent); background: var(--accent-light); padding: 1px 6px; border-radius: 4px; }
  .foot-effort { font-style: italic; }
  .foot-date { font-family: 'JetBrains Mono', monospace; }
  .foot-refs { color: var(--gold); font-weight: 600; }
  .type-tag { font-size: 9px; font-weight: 800; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .t-feature { background: #dcfce7; color: #166534; }
  .t-bug { background: #fee2e2; color: #991b1b; }
  .t-techdebt { background: #e0e7ff; color: #3730a3; }
  .t-docs { background: #f1f5f9; color: #475569; }
  .t-business { background: var(--gold-light); color: var(--gold); }
  .t-other { background: #f1f5f9; color: #475569; }
  .card template { display: none; }

  .no-results { display: none; text-align: center; padding: 60px 20px; color: var(--text2); }
  .no-results.visible { display: block; }
  .no-results h3 { font-size: 15px; margin-bottom: 6px; color: var(--shell); }

  .drawer-backdrop { position: fixed; inset: 0; background: rgba(15,20,30,0.45); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 200; }
  .drawer-backdrop.open { opacity: 1; pointer-events: auto; }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 92vw); background: var(--card); box-shadow: -8px 0 30px rgba(0,0,0,0.18); transform: translateX(100%); transition: transform 0.25s cubic-bezier(.22,1,.36,1); z-index: 201; overflow-y: auto; padding: 22px 24px 40px; }
  .drawer.open { transform: translateX(0); }
  .drawer-close { position: absolute; top: 14px; right: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 50%; width: 30px; height: 30px; font-size: 18px; line-height: 1; cursor: pointer; color: var(--text2); }
  .drawer-close:hover { color: var(--danger); border-color: var(--danger); }
  .drawer-badges { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 30px 10px 0; }
  .drawer-title { font-size: 18px; font-weight: 800; line-height: 1.3; margin-bottom: 16px; padding-right: 20px; }
  .drawer-fields { display: flex; flex-direction: column; gap: 14px; }
  .field dt { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); margin-bottom: 4px; }
  .field dd { font-size: 13px; line-height: 1.65; color: #334155; }
  .field dd .muted { color: var(--text2); font-style: italic; }
  .field dd h4 { font-size: 13.5px; margin: 10px 0 4px; color: var(--shell); }
  .field dd h5 { font-size: 13px; margin: 8px 0 4px; color: var(--accent); }
  .field dd ul, .field dd ol { margin: 4px 0 8px 20px; }
  .field dd li { margin-bottom: 3px; }
  .field dd code { background: #f1f5f9; padding: 0 4px; border-radius: 3px; font-size: 11.5px; }
  .field dd pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-size: 11.5px; margin: 8px 0; }
  .field dd pre code { background: none; color: inherit; padding: 0; }
  .field dd p { margin-bottom: 8px; }
  .field dd p:last-child { margin-bottom: 0; }
  .md-table-wrap { overflow-x: auto; margin: 8px 0; }
  .md-table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
  .md-table th, .md-table td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; vertical-align: top; }
  .md-table th { background: #f8fafc; font-weight: 700; }

  .hidden { display: none !important; }

  @media (max-width: 720px) {
    .sidebar { display: none !important; }
    .main { padding: 16px; }
    header { padding: 16px; }
    .drawer { width: 100vw; }
  }
"""


def build_js():
    return """
document.addEventListener('DOMContentLoaded', () => {
  const statusBtns = document.querySelectorAll('.status-btn');
  const viewOpen = document.getElementById('view-open');
  const viewClosed = document.getElementById('view-closed');
  const sidebarOpen = document.getElementById('sidebar-open');
  const sidebarClosed = document.getElementById('sidebar-closed');
  const openChips = document.getElementById('open-chips');
  const closedChips = document.getElementById('closed-chips');
  const search = document.getElementById('search');
  const resultCount = document.getElementById('result-count');
  const noResults = document.getElementById('no-results');
  const drawer = document.getElementById('drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerBody = document.getElementById('drawer-body');
  const drawerClose = document.getElementById('drawer-close');

  let activeStatus = 'open';
  let activePriority = 'all';
  let activeKind = 'all';

  function norm(s) { return (s || '').toLowerCase(); }

  function setStatus(status) {
    activeStatus = status;
    statusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === status));
    viewOpen.style.display = status === 'open' ? '' : 'none';
    viewClosed.style.display = status === 'closed' ? '' : 'none';
    sidebarOpen.style.display = status === 'open' ? '' : 'none';
    sidebarClosed.style.display = status === 'closed' ? '' : 'none';
    openChips.style.display = status === 'open' ? '' : 'none';
    closedChips.style.display = status === 'closed' ? '' : 'none';
    applyFilters();
  }

  statusBtns.forEach(btn => btn.addEventListener('click', () => setStatus(btn.dataset.status)));

  openChips.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    openChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activePriority = chip.dataset.filterPriority;
    applyFilters();
  }));

  closedChips.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    closedChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeKind = chip.dataset.filterKind;
    applyFilters();
  }));

  document.querySelectorAll('[data-jump-priority]').forEach(el => el.addEventListener('click', () => {
    const val = el.dataset.jumpPriority;
    activePriority = val;
    openChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filterPriority === val));
    document.querySelectorAll('#sidebar-open .sidebar-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    applyFilters();
    const target = document.getElementById('group-' + val);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  document.querySelectorAll('[data-jump-kind]').forEach(el => el.addEventListener('click', () => {
    const val = el.dataset.jumpKind;
    activeKind = val;
    closedChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filterKind === val));
    document.querySelectorAll('#sidebar-closed .sidebar-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    applyFilters();
    const target = document.getElementById('group-' + val);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  function applyFilters() {
    const q = norm(search.value);
    const activeView = activeStatus === 'open' ? viewOpen : viewClosed;
    let visible = 0, total = 0;

    activeView.querySelectorAll('.card').forEach(card => {
      total++;
      const matchesQ = !q || card.dataset.search.includes(q);
      const matchesP = activeStatus === 'closed' || activePriority === 'all' || card.dataset.priority === activePriority;
      const matchesK = activeStatus === 'open' || activeKind === 'all' || card.dataset.kind === activeKind;
      const show = matchesQ && matchesP && matchesK;
      card.classList.toggle('hidden', !show);
      if (show) visible++;
    });

    activeView.querySelectorAll('.item-group').forEach(group => {
      const anyVisible = group.querySelectorAll('.card:not(.hidden)').length > 0;
      group.classList.toggle('hidden', !anyVisible);
    });

    resultCount.textContent = visible + ' / ' + total + ' shown';
    noResults.classList.toggle('visible', visible === 0);
  }

  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openDrawer(card));
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDrawer(card); }
    });
  });

  function openDrawer(card) {
    const tpl = card.querySelector('template');
    if (!tpl) return;
    drawerBody.innerHTML = '';
    drawerBody.appendChild(tpl.content.cloneNode(true));
    drawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    drawerClose.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
  }

  drawerClose.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDrawer(); });

  search.addEventListener('input', applyFilters);
  applyFilters();
});
"""


def main():
    md_text = MD_PATH.read_text(encoding="utf-8")
    preamble, open_items_sections, history_entries = parse_backlog(md_text)
    open_items, closed_items = build_unified_items(open_items_sections, history_entries)

    # ---- Priority groups (open) ----
    priority_meta = {}
    for item in open_items:
        slug = item["priority"]
        priority_meta.setdefault(slug, {"label": item["priority_label"], "items": []})
        priority_meta[slug]["items"].append(item)
    priority_slugs = sorted(priority_meta.keys())

    priority_chips = "\n".join(
        f'<span class="chip" data-filter-priority="{slug}">{esc(priority_meta[slug]["label"])} ({len(priority_meta[slug]["items"])})</span>'
        for slug in priority_slugs
    )
    sidebar_open = "\n".join(
        f'<div class="sidebar-item" data-jump-priority="{slug}"><span class="swatch" style="--tab-color:{PRIORITY_COLORS.get(slug, PRIORITY_COLOR_DEFAULT)}"></span>{esc(priority_meta[slug]["label"])}<span class="sidebar-count">{len(priority_meta[slug]["items"])}</span></div>'
        for slug in priority_slugs
    )
    open_groups_html = "\n".join(
        render_group(
            slug,
            priority_meta[slug]["label"],
            len(priority_meta[slug]["items"]),
            PRIORITY_COLORS.get(slug, PRIORITY_COLOR_DEFAULT),
            "\n".join(render_card(it) for it in priority_meta[slug]["items"]),
        )
        for slug in priority_slugs
    )

    # ---- Kind groups (closed) ----
    kind_meta = {}
    for item in closed_items:
        slug = item["kind"]
        kind_meta.setdefault(slug, []).append(item)

    kind_chips = "\n".join(
        f'<span class="chip" data-filter-kind="{slug}">{esc(KIND_GROUP_LABELS[slug])} ({len(kind_meta[slug])})</span>'
        for slug in KIND_GROUP_ORDER if slug in kind_meta
    )
    sidebar_closed = "\n".join(
        f'<div class="sidebar-item" data-jump-kind="{slug}"><span class="swatch" style="--tab-color:{KIND_COLORS.get(slug, PRIORITY_COLOR_DEFAULT)}"></span>{esc(KIND_GROUP_LABELS[slug])}<span class="sidebar-count">{len(kind_meta[slug])}</span></div>'
        for slug in KIND_GROUP_ORDER if slug in kind_meta
    )
    closed_groups_html = "\n".join(
        render_group(
            slug,
            KIND_GROUP_LABELS[slug],
            len(kind_meta[slug]),
            KIND_COLORS.get(slug, PRIORITY_COLOR_DEFAULT),
            "\n".join(render_card(it) for it in kind_meta[slug]),
        )
        for slug in KIND_GROUP_ORDER if slug in kind_meta
    )

    page = PAGE_TEMPLATE.format(
        css=build_css(),
        js=build_js(),
        generated_at=datetime.now().strftime("%Y-%m-%d"),
        badges=render_preamble_badges(preamble),
        open_count=len(open_items),
        closed_count=len(closed_items),
        priority_chips=priority_chips,
        kind_chips=kind_chips,
        sidebar_open=sidebar_open,
        sidebar_closed=sidebar_closed,
        open_groups_html=open_groups_html,
        closed_groups_html=closed_groups_html,
    )

    HTML_PATH.write_text(page, encoding="utf-8")
    print(f"Wrote {HTML_PATH} ({len(page):,} bytes) — {len(open_items)} open items, {len(closed_items)} closed items.")


if __name__ == "__main__":
    sys.exit(main())
