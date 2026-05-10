# FORZAKIT — Pitch View: Required Fixes

> Hand this to Claude Code instead of (or alongside) the general overhaul spec.
> This document is a **diff**, not a redesign — it lists exactly what is wrong with the current build of the **My Squad → Pitch** view and the precise change needed for each.
> Do not invent new patterns. Do not reinterpret. Apply each rule literally.

---

## Reference

The correct target is `FORZAKIT Final.html` → "My Squad — Pitch view" → Desktop artboard (`FinalSquadDesktop`). Open it before starting. Every rule below describes a change **from the current build** to match that target.

---

## Anatomy of the pitch view (read this first)

The pitch view is composed of **exactly five layers**, stacked in this z-order from back to front:

1. **Pitch surface** — a single rounded-rectangle container. Background: `linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)`. Border-radius: 8px. Inset border: `1px solid var(--rule)`. **Not** a chalk-drawn football pitch with halfway line, penalty boxes, corner arcs.
2. **Position lane lines** — four horizontal 1px lines at `top: 22% / 46% / 70% / 92%`, color `rgba(0,180,216,.10)`. They run from `left: 24px` to `right: 24px` only. **They are not a football pitch outline.**
3. **Center accent** — one 160×160 circle at the center, `border: 1px solid rgba(242,238,229,.06)`, plus a 1px horizontal halfway line (`rgba(242,238,229,.08)`) inset 10% from each side. That's it. No penalty box. No corner arcs. No goal box.
4. **Lane labels (gutter)** — the words `FWD / MID / DEF / GK` at `left: 18px`, vertically centered on each lane line. Mono 9px, color `rgba(0,180,216,.5)`, with a `background: #0A0D12` and `padding: 2px 4px` so the line passes *behind* them. They sit **on top of** the lane line, not floating beside it.
5. **Player nameplates** — horizontal pill-shape tokens. See § Token spec.

Anything outside this list does not belong on the pitch.

---

## What is wrong in the current build (with fix per item)

### 1. The pitch is drawing a football field, not lanes
**Current:** The container shows a chalk-line football pitch — halfway line, center circle, two penalty areas, two goal boxes, corner arcs. The whole field outline is rendered.

**Required:** Remove all chalk pitch geometry. The pitch is a flat dark gradient rectangle with:
- 4 horizontal cyan-tinted lane lines (positions above)
- 1 faint white halfway line
- 1 faint white centre circle (160px, no fill)

That is the entire pitch. There are **no penalty areas, no goal boxes, no corners, no touchlines drawn inside the container**. The container's own 1px border is the only outline.

### 2. Lane labels are in the wrong place and unreadable
**Current:** `FWD / MID / DEF / GK` appear far to the left of the pitch container, in dim grey, looking like leftover debug text.

**Required:** They sit **inside the pitch container**, at `left: 18px`, on top of each lane line. Mono 9px, color `rgba(0,180,216,.5)`. Each label has a `background: #0A0D12` chip with `2px 4px` padding so the lane line visually passes behind it. Top values: 22% / 46% / 70% / 92% with `transform: translateY(-50%)`.

### 3. Nameplates are clipped on the right side
**Current:** The right-most player on the FWD and DEF rows (and elsewhere) is cut off by the pitch container — the nameplate extends past the right edge.

**Required:** The pitch container has horizontal padding for the row of tokens. Token x-coordinates are normalized 0–100% within the container; tokens are positioned with `transform: translate(-50%, -50%)` so their **center** lands on `x%`. Use the exact x values from `squad-data.jsx`:
- GK: x=50
- DEF: x=14, 38, 62, 86
- MID: x=22, 50, 78
- FWD: x=14, 50, 86

A token has `min-width: 148px` desktop. With `x=86%` that means the token's right edge sits at roughly `86% + 74px`. **The pitch container must be wide enough to contain that** — i.e. the pitch is the full width of the main column, not a narrow centered box. If the right side is clipping, the pitch container is too narrow; widen it to fill the available space (page padding 32px left and right of the container, that's all).

### 4. Tokens are the wrong shape
**Current:** Square boxes containing only a "0" inside a cyan border, with the player name floating to the right outside the box.

**Required:** A token is a **single horizontal pill**, all parts inside one bordered container:
```
┌────────────────────────────────────────┐
│  [36×36 number]   ● PLAYERNAME         │
│                   CLU · N PTS          │
└────────────────────────────────────────┘
```
- One `background: rgba(15,18,24,.92)` rectangle, `border: 1px solid var(--rule)`, `border-radius: 4px`, `padding: 8px 12px 8px 10px`, `min-width: 148px`, `display: flex`, `align-items: center`, `gap: 10px`.
- **Inside, left:** 36×36 number badge — Archivo Black 14px. Captain: gold fill + ink text. Otherwise: transparent fill, `1.5px solid var(--cyan)` border, cyan number.
- **Inside, right:** two stacked text rows. Top row = status dot (7px, status colour) + player surname (Archivo Black 13px, uppercase, -0.01em tracking). Bottom row = `CLUB · N PTS` in mono 9px, color `var(--mute)`, letter-spacing 0.14em.

The name **never** lives outside the bordered container. The number **never** floats alone — it's always the left half of a pill.

### 5. The "0" badges look like detached widgets
**Current:** Each player has a small cyan-bordered box with "0" in it, and the name in a separate box to its right. They visually read as two unrelated UI elements.

**Required:** They are one element (see #4). One border, not two. The number badge does **not** have its own background fill; it inherits the pill background. Only its border and text colour distinguish it.

### 6. Captain is not visually distinct
**Current:** No captain treatment visible.

**Required:** The captain's number badge has `background: var(--gold)` fill with `color: #0A0A0A` text and a `border: 2px solid var(--gold)` (replacing the cyan border). Additionally, a small 18×18 gold circle with a black "C" sits at `top: -7px, right: -7px` of the pill, with a `2px solid var(--ink)` border to punch it out of the pill outline.

### 7. The list panel is a separate page section, not a sidebar
**Current:** A "Bench / Chips / Status" panel on the right rail next to the pitch.

**Required:** The Pitch view does not have a right rail. The page is just: header → sub-tabs (Pitch / List / Chips / Status) → pitch container, full width. The bench, chips, and status are **separate sub-tabs**, not a permanent right panel.

If the right rail must stay for product reasons, it sits at a fixed `width: 320px`, and the pitch container shrinks to fill the remaining space minus 32px gap. The pitch container must still be wide enough that no token clips (see #3).

### 8. Fixture context strip is missing
**Current:** No fixture/gameweek line on the pitch.

**Required:** Inside the pitch container, at `top: 14px`, two mono 10px strings, color `var(--mute)`, letter-spacing `.22em`:
- Left (at `left: 18px`): `STARTING XI · 4-3-3`
- Right (at `right: 18px`): `GW 12 · VS RIVALS FC`

### 9. The page header is missing its right-side KPIs
**Current:** "TRANSFERS" and "BUDGET $3M" appear in the wrong typographic register (red, top-right, no labels).

**Required:** Right-aligned cluster of two KPI blocks. Each block:
- Mono 9px `var(--mute)` label on top (`SQUAD`, `BUDGET`)
- Archivo Black 20px value below
- `BUDGET` value is in `var(--cyan)`, not red. `SQUAD` value uses `15` then a mono 11px `/15` in `var(--mute)`.

Currency symbol is `£`, not `$`. The brand uses pounds.

### 10. Page eyebrow uses the wrong type
**Current:** "TACTICAL SHEET" looks correct; "PREMIER FANTASY LEAGUE" cyan pill next to "MY SQUAD" does not exist in the spec.

**Required:** Remove the "PREMIER FANTASY LEAGUE" cyan pill. The header is just:
- Mono 10px `var(--mute)` eyebrow: `TACTICAL SHEET`
- Archivo Black 34px title: `My Squad`
No other elements in the left header cluster.

---

## Token spec — copy this exactly

```jsx
function HybridToken({ p }){
  const sc = STATUS_COLOR[p.status]; // fit→positive, doubt→gold, out→danger
  return (
    <div style={{
      position:'absolute',
      left:`${p.x}%`, top:`${p.y}%`,
      transform:'translate(-50%,-50%)',
      display:'flex', alignItems:'center', gap:10,
      padding:'8px 12px 8px 10px',
      background:'rgba(15,18,24,.92)',
      backdropFilter:'blur(4px)',
      border:'1px solid var(--rule)',
      borderRadius:4,
      minWidth:148,
    }}>
      <div style={{
        width:36, height:36,
        background: p.cap ? 'var(--gold)' : 'transparent',
        border: `1.5px solid ${p.cap ? 'var(--gold)' : 'var(--cyan)'}`,
        color: p.cap ? '#0A0A0A' : 'var(--cyan)',
        fontFamily:'Archivo Black', fontSize:14,
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink:0,
      }}>{p.no}</div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:sc, flexShrink:0 }}/>
          <span style={{
            fontFamily:'Archivo Black', fontSize:13,
            letterSpacing:'-0.01em', textTransform:'uppercase',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>{p.last}</span>
        </div>
        <div style={{
          fontFamily:'JetBrains Mono', fontSize:9,
          color:'var(--mute)', letterSpacing:'.14em', marginTop:2,
        }}>{p.club} · {p.pts} PTS</div>
      </div>

      {p.cap && (
        <div style={{
          position:'absolute', top:-7, right:-7,
          width:18, height:18, borderRadius:'50%',
          background:'var(--gold)', color:'#0A0A0A',
          fontFamily:'Archivo Black', fontSize:9,
          display:'flex', alignItems:'center', justifyContent:'center',
          border:'2px solid var(--ink)',
        }}>C</div>
      )}
    </div>
  );
}
```

This is the **only** token style. Do not produce any variant.

---

## Pitch container spec — copy this exactly

```jsx
<div style={{
  flex:1,
  position:'relative',
  padding:'28px 40px 32px',
  background:'#08090C',
}}>
  <div style={{
    position:'absolute',
    inset:'28px 40px 32px',
    background:'linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)',
    borderRadius:8,
    overflow:'hidden',
    boxShadow:'inset 0 0 0 1px var(--rule)',
  }}>
    {/* Lane lines */}
    {[22, 46, 70, 92].map(y => (
      <div key={y} style={{
        position:'absolute', left:24, right:24, top:`${y}%`,
        height:1, background:'rgba(0,180,216,.10)',
      }}/>
    ))}

    {/* Lane labels (on top of lines) */}
    {[
      { y:22, label:'FWD' },
      { y:46, label:'MID' },
      { y:70, label:'DEF' },
      { y:92, label:'GK' },
    ].map(l => (
      <div key={l.label} style={{
        position:'absolute', left:18, top:`${l.y}%`,
        transform:'translateY(-50%)',
        fontFamily:'JetBrains Mono', fontSize:9,
        color:'rgba(0,180,216,.5)',
        background:'#0A0D12', padding:'2px 4px',
        letterSpacing:'.18em',
      }}>{l.label}</div>
    ))}

    {/* Centre halfway accent */}
    <div style={{
      position:'absolute', left:'10%', right:'10%', top:'50%',
      height:1, background:'rgba(242,238,229,.08)',
    }}/>
    <div style={{
      position:'absolute', left:'50%', top:'50%',
      transform:'translate(-50%,-50%)',
      width:160, height:160, borderRadius:'50%',
      border:'1px solid rgba(242,238,229,.06)',
    }}/>

    {/* Fixture context */}
    <div style={{
      position:'absolute', top:14, left:18, right:18,
      display:'flex', justifyContent:'space-between',
    }}>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:10,
        color:'var(--mute)', letterSpacing:'.22em' }}>STARTING XI · 4-3-3</div>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:10,
        color:'var(--mute)', letterSpacing:'.22em' }}>GW 12 · VS RIVALS FC</div>
    </div>

    {SQUAD.map(p => <HybridToken key={p.id} p={p}/>)}
  </div>
</div>
```

---

## Acceptance checklist

Before saying "done", confirm every item:

- [ ] No drawn football pitch (no halfway line drawn as part of pitch geometry, no penalty boxes, no goal boxes, no corner arcs, no touchline rectangle inside the container).
- [ ] Four horizontal cyan lane lines visible at 22/46/70/92%.
- [ ] Lane labels FWD/MID/DEF/GK sit on top of the lines at left:18px, with a dark background chip cutting through the line.
- [ ] One faint centre circle (160px) and one faint halfway line. Nothing else.
- [ ] Every token is a single horizontal pill. Number badge and name share one border.
- [ ] No token is clipped by the container right edge.
- [ ] Token min-width 148px desktop / 78px mobile.
- [ ] Captain has gold-filled number badge AND a "C" circle at top-right.
- [ ] Status dot is 7px (desktop) and sits immediately left of the surname.
- [ ] Currency is `£`. Budget value is cyan. Squad shows `N/15` with a muted `/15`.
- [ ] Header is `TACTICAL SHEET` eyebrow + `My Squad` title only — no extra pills.
- [ ] Sub-tabs row exists: Pitch / List / Chips / Status. Active tab has a 2px cyan underline.
- [ ] No right-rail panel on the Pitch sub-tab. Bench/Chips/Status are sibling tabs, not always-on panels.

If any box is unchecked, the build is not done. Re-read the section it corresponds to and apply the fix verbatim.
