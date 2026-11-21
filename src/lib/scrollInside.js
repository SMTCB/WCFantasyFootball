// Scroll an element into view inside its own scroll box only.
// Element.scrollIntoView also scrolls every ancestor, the page scroller (#main-content)
// included, so a chat jumping to its last message dragged the whole screen down on
// entry and left the composer mid-screen (owner 2026-11-21). This never moves the page.
// No imports on purpose: safe to use from any depth (Rolldown TDZ rule, CLAUDE.md).

const PAGE_SCROLLERS = new Set(['main-content']);

function scrollerOf(el, axis) {
  for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    const o = axis === 'x' ? s.overflowX : s.overflowY;
    if (o === 'auto' || o === 'scroll') return PAGE_SCROLLERS.has(p.id) ? null : p;
  }
  return null;
}

// block: 'end' | 'center' | 'nearest' (vertical) — inline: 'center' (horizontal)
export function scrollInside(el, { block = 'end', inline, behavior = 'smooth' } = {}) {
  if (!el) return;
  const axis = inline ? 'x' : 'y';
  const box = scrollerOf(el, axis);
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (axis === 'x') {
    box.scrollBy({ left: (r.left + r.width / 2) - (b.left + b.width / 2), behavior });
    return;
  }
  let top = 0;
  if (block === 'center') top = (r.top + r.height / 2) - (b.top + b.height / 2);
  else if (block === 'nearest') top = r.top < b.top ? r.top - b.top : r.bottom > b.bottom ? r.bottom - b.bottom : 0;
  else top = r.bottom - b.bottom;
  if (top) box.scrollBy({ top, behavior });
}
