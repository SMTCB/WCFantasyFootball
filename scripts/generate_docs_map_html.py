"""Render DOCS_MAP.md to a light-theme, searchable DOCS_MAP.html. Run: python scripts/generate_docs_map_html.py"""
import html, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "DOCS_MAP.md").read_text(encoding="utf-8")


def inline(t):
    t = html.escape(t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: '<a href="%s">%s</a>' % (re.sub(r"\.md$", ".md", m.group(2)), m.group(1)), t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    return t


out, lines, i = [], src.split("\n"), 0
while i < len(lines):
    l = lines[i]
    if l.startswith("# "):
        out.append("<h1>%s</h1>" % inline(l[2:]))
    elif l.startswith("## "):
        out.append("<h2>%s</h2>" % inline(l[3:]))
    elif l.startswith("### "):
        out.append("<h3>%s</h3>" % inline(l[4:]))
    elif l.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                rows.append(cells)
            i += 1
        i -= 1
        h, body = rows[0], rows[1:]
        out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (
            "".join("<th>%s</th>" % inline(c) for c in h),
            "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in body)))
    elif re.match(r"\d+\. ", l):
        items = []
        while i < len(lines) and re.match(r"\d+\. ", lines[i]):
            items.append("<li>%s</li>" % inline(re.sub(r"^\d+\. ", "", lines[i])))
            i += 1
        i -= 1
        out.append("<ol>%s</ol>" % "".join(items))
    elif l.strip() and l.strip() != "---":
        out.append("<p>%s</p>" % inline(l))
    i += 1

page = """<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Frontrow — Docs Map</title>
<style>
:root{color-scheme:light;--bg:#f5f4f0;--card:#fff;--ink:#18202e;--mute:#64748b;--line:#e2e8f0;--accent:#1a6fa8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,system-ui,-apple-system,sans-serif}
main{max-width:920px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 8px}h2{font-size:17px;margin:32px 0 10px}h3{font-size:14px;margin:20px 0 6px}
a{color:var(--accent)}code{background:#eef2f6;padding:1px 5px;border-radius:4px;font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:8px 0}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--line)}th{background:#f8fafc;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--mute)}
tr:last-child td{border-bottom:0}tr.hide{display:none}
#q{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:15px;background:#fff;color:var(--ink);margin:12px 0 4px}
@media(max-width:600px){td,th{padding:8px}}
</style></head><body><main>
<input id="q" type="search" placeholder="Search the docs map…" aria-label="Search the docs map">
@@BODY@@
<p style="color:var(--mute);font-size:12px">Generated from DOCS_MAP.md. Do not hand-edit; re-run scripts/generate_docs_map_html.py.</p>
</main><script>
document.getElementById('q').addEventListener('input',function(e){var v=e.target.value.toLowerCase();
document.querySelectorAll('tbody tr').forEach(function(r){r.classList.toggle('hide',v&&r.textContent.toLowerCase().indexOf(v)<0)})});
</script></body></html>""".replace("@@BODY@@", "\n".join(out))
(root / "DOCS_MAP.html").write_text(page, encoding="utf-8", newline="\n")
print("Wrote DOCS_MAP.html")
