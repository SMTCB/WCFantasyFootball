# FORZAKIT — UI Overhaul Specification

> Handoff doc for Claude Code.
> Apply these rules to **every screen** in the app — including ones not explicitly mocked here.
> When in doubt, prefer **clarity over decoration**. The pitch isn't the brand; the typography and the palette are.

---

## 0. North-star principles

1. **The player name is the hero.** Always set in `Archivo Black`, uppercase, slight negative tracking. Never the smallest thing on a row.
2. **One status system, three states.** Coloured dot + word. Never coloured rings, halos, or stacked badges.
3. **Mono for metadata, Black for headlines, regular for body.** No exceptions.
4. **Cyan = primary action / primary metric.** Gold = captain / value-money cue. Red = injured / live-warning. Don't reuse them for decoration.
5. **No emoji. No drawn-SVG icons of crests, balls, whistles.** Use position chips, country codes, and club abbreviations as text instead.
6. **Dark by default, paper for print/email only.** Mobile and desktop both run dark; one app, one palette.

---

## 1. Design tokens

```css
:root{
  /* surfaces — dark mode is default everywhere */
  --ink:        #080A0E;   /* page background */
  --ink-2:      #0F1218;   /* sidebar, raised cards */
  --ink-3:      #161B25;   /* hover / pressed surface */
  --rule:       #1E2530;   /* dividers, 1px borders */

  /* foreground */
  --paper:      #F2EEE5;   /* primary text */
  --mute:       #8B95A1;   /* metadata, mono labels */

  /* accents — use sparingly and consistently */
  --cyan:       #00B4D8;   /* primary actions, primary numbers, active tab */
  --gold:       #E0A800;   /* captain, value, doubt status */
  --positive:   #22C55E;   /* fit / available */
  --warn:       #F59E0B;   /* same hue family as gold but for warnings */
  --danger:     #EF4444;   /* injured / out / destructive */

  /* position tones (used by chips and section accents) */
  --pos-gk:     #A855F7;   /* purple */
  --pos-def:    #00B4D8;   /* cyan */
  --pos-mid:    #E0A800;   /* gold */
  --pos-fwd:    #EF4444;   /* red */
}
```

**Don't introduce new colours.** If a new accent is needed, justify it against this list first. If it really is new, add it here — don't add it inline.

---

## 2. Type system

```css
/* Pair: Archivo Black + Archivo + JetBrains Mono. Loaded from Google Fonts. */
font-family: 'Archivo', sans-serif;            /* default body */
font-family: 'Archivo Black', sans-serif;      /* headlines, names, numbers that matter */
font-family: 'JetBrains Mono', monospace;      /* labels, metadata, eyebrows, technical */
```

| Role            | Font            | Size      | Tracking  | Case  | Notes                              |
| --------------- | --------------- | --------- | --------- | ----- | ---------------------------------- |
| Page eyebrow    | JetBrains Mono  | 10–11px   | 0.22em    | UPPER | Always above page title            |
| Page title      | Archivo Black   | 28–34px   | -0.02em   | TitleCase | Single line                    |
| Section label   | JetBrains Mono  | 10px      | 0.18em    | UPPER | With 3px coloured tab on the left  |
| Player name     | Archivo Black   | 13–15px   | -0.01em   | UPPER | The hero of every row              |
| Number / score  | Archivo Black   | 14–22px   | -0.02em   | —     | Cyan if it's the headline metric   |
| Metadata        | JetBrains Mono  | 9–11px    | 0.14em    | UPPER | Club codes, country, "PTS", "GW 12"|
| Body            | Archivo 400/500 | 13–15px   | normal    | sentence | Long-form copy only             |
| Button          | JetBrains Mono  | 10–11px   | 0.18em    | UPPER | All buttons, all sizes             |

Never use Archivo regular for a player name. Never use Archivo Black for body copy.

---

## 3. Layout grammar

### 3.1 Desktop chrome

- **Sidebar nav, 220px wide, `--ink-2` background.** Vertical stack. Active item: cyan text, `rgba(0,180,216,.08)` fill, 2px cyan left border. Inactive: `--paper` text, transparent.
- **Page header:** eyebrow + title on the left, KPIs on the right (right-aligned, `--mute` mono labels above bold values). Bottom border `1px solid var(--rule)`.
- **Sub-tabs (Pitch / List / Chips / Status):** mono 11px, 0.18em tracking. Active = `--paper` colour + 2px cyan underline at the bottom. Inactive = `--mute`.
- **Page padding:** 24–32px horizontal, 24px top.

### 3.2 Mobile chrome

- Status bar 32px, mono 11px, `--paper`.
- Same wordmark + budget pattern as desktop, scaled down. Tabs are mono 10px with 2px cyan underline.
- Page padding: 14–18px.
- **No light/paper backgrounds on mobile.** Mobile mirrors desktop.

### 3.3 Section dividers

Lists are split into position groups. Every group header looks like:

```
[3px tone bar]  POSITION LABEL · count/total
```

The bar's colour matches the position tone (GK/DEF/MID/FWD). The list itself is separated row-from-row by `1px solid var(--rule)`.

---

## 4. Components

### 4.1 Status dot

```jsx
<div style={{width:8,height:8,borderRadius:'50%',background:STATUS[player.status]}}/>
```

```js
const STATUS = {
  fit:   'var(--positive)',
  doubt: 'var(--gold)',
  out:   'var(--danger)',
};
const STATUS_LABEL = { fit:'AVAILABLE', doubt:'DOUBTFUL', out:'INJURED' };
```

Mobile: 6–7px. Desktop: 8px. **Never** wrap a player avatar in a coloured ring for status — use the dot.

### 4.2 Position chip

Outlined rectangle, position-tinted. Used in Squad list, Bench, Market, anywhere a player needs a position label.

```jsx
<div style={{
  width:42, height:22,
  border:`1px solid ${POS_TONE[player.pos]}`,
  color:POS_TONE[player.pos],
  fontFamily:'Archivo Black', fontSize:10,
  display:'flex', alignItems:'center', justifyContent:'center',
}}>{player.pos}</div>
```

Mobile size: 30×16, fontSize 8–9. Empty-slot variant: same size, `border: 1px dashed`, content `+`.

### 4.3 Captain pill

```jsx
<span style={{
  fontFamily:'Archivo Black', fontSize:9,
  background:'var(--gold)', color:'var(--ink)',
  padding:'2px 6px',
}}>C</span>
```

Always inline next to the name, never as a separate badge stack.

### 4.4 Player row (the universal pattern)

```
#NN  [POS]  ●  PLAYER NAME  C    CLUB · CTY    14    AVAILABLE    [SUB]
```

Column rules:
- `#NN` — mono 10px, `--mute`.
- Position chip — see 4.2.
- Status dot + name — flex row with 8–10px gap. Name ellipsises.
- Club · country — mono 10px, `--mute`.
- Points — Archivo Black, right-aligned. Cyan if it's "this gameweek's score" specifically.
- Status word — mono 10px, colour matches the dot.
- Action button — outlined, mono 10–11px, 0.18em tracking.

Empty-slot variant: dashed position chip, "EMPTY SLOT" name in tone colour, "OPEN MARKET TO SIGN" mono subtitle, outlined SIGN button in tone colour.

### 4.5 Buttons

| Variant   | Border                   | Background | Text colour |
| --------- | ------------------------ | ---------- | ----------- |
| Primary   | `1px solid var(--cyan)`  | transparent or `var(--cyan)` fill on press | `var(--cyan)` (or `var(--ink)` on filled) |
| Secondary | `1px solid var(--rule)`  | transparent | `var(--paper)` |
| Tone      | `1px solid <pos-tone>`   | transparent | tone        |

Mono 10–11px, 0.18em tracking, padding `6px 14px`. No rounded corners (radius 0–2px max). No drop shadows.

### 4.6 Pitch tokens (for the pitch view only)

Horizontal nameplate, not a circular avatar:
- 36×36 number badge. Captain: gold fill + ink number. Otherwise: cyan border + cyan number, transparent fill.
- Adjacent two-line block: status dot + uppercase name on top, `CLUB · N PTS` mono on bottom.
- Background: `rgba(15,18,24,.92)` with backdrop blur. Border: `1px solid var(--rule)`. Min-width 148px desktop / 78px mobile.

The pitch itself is **not green**. It's `linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)` with four faint cyan position-lane lines (`rgba(0,180,216,.10)`) and "FWD/MID/DEF/GK" labels gutter-left in mono 9px.

---

## 5. Iconography rule

**You don't need icons.** The current build uses zero illustrative SVG icons and reads better for it. Position is a chip, status is a dot, captain is a pill, country is a 3-letter code, club is a 3-letter code.

If a screen genuinely requires an icon (e.g. nav with no labels, kebab menu, close button), use a **stroke-only**, 1.5px line-weight, monoline icon. No filled icons, no two-tone icons, no emoji.

---

## 6. Screens to harmonise (apply rules above)

- ✅ My Squad — Pitch view (mocked)
- ✅ My Squad — List view (mocked)
- ✅ Player Market (mocked)
- ⏳ **Bench / Substitutes** — reuse 4.4 player row. Group header "BENCH". No status word column needed; show position chip + name + points + "SUB IN" tone button.
- ⏳ **Player Status panel** — list of doubtful/out players. 4.4 player row with the status word in the right-most column instead of a button. Add a small "available probability" mono percentage.
- ⏳ **Captain selection** — same row pattern, action button is "MAKE CAPTAIN" / "MAKE VICE".
- ⏳ **Scores / Live** — same chrome (sidebar + header + tabs). Each fixture is a card in `--ink-2` with home/away rows that reuse the player-row pattern. Live indicator: red dot + "LIVE" in mono.
- ⏳ **League** — header + standings table. Rank in mono, team name Archivo Black, weekly points cyan, total points paper. Promote/relegate movement uses arrow + tone colour.
- ⏳ **Chips** — grid of cards in `--ink-2`. Each chip: mono name, Archivo Black title, body description, primary outlined button "USE CHIP".
- ⏳ **Profile / Settings** — left sidebar nav stays. Forms: 1px `--rule` borders on inputs, mono labels above, paper text, cyan focus ring. No filled inputs.
- ⏳ **Empty states** — always a mono eyebrow + Archivo Black headline + one outlined button in the tone of the action. No illustrations.
- ⏳ **Modals / drawers** — `--ink-2` surface, `--rule` border, no rounded corners beyond 4px. Title in Archivo Black 22px, body in Archivo 14px.
- ⏳ **Toasts** — full-bleed strip at the top, `--ink-2`, 2px left border in tone (positive/cyan/gold/danger). Mono message.

---

## 7. Anti-patterns — do NOT ship these

- ❌ Coloured rings around a player initial as a status indicator.
- ❌ Two-letter initials inside a circle (the original screen). Use the position chip instead.
- ❌ Mixing rounded-corner cards (12px+) with sharp-corner ones. The system is sharp (0–4px radius).
- ❌ Light/cream surfaces inside the dark app.
- ❌ Drop shadows on flat surfaces.
- ❌ Icons that duplicate adjacent text.
- ❌ Emoji.
- ❌ Body copy in Archivo Black, or names in Archivo regular.
- ❌ Cyan for decoration (borders that aren't accents, fills that aren't actions). Cyan is reserved.

---

## 8. Implementation guidance for Claude Code

1. **Start with `tokens.css`** — paste section 1 verbatim into the project root and import once globally.
2. **Build a shared `<Shell>` component** — sidebar + header + sub-tabs. Every page renders inside it. The active sub-tab is the only thing that changes.
3. **Build `<PlayerRow>` once.** Every list view (Squad, Bench, Market, Status, Captain) consumes it with prop variants for the rightmost column.
4. **Build `<PositionChip>`, `<StatusDot>`, `<CaptainPill>`, `<EmptyRow>` as primitives.** Don't reimplement them inline.
5. **Mobile = same components, smaller scale.** No separate mobile design system. Use container queries or `clamp()` for sizes; the rules in section 2 give you the small/large bounds.
6. **When designing a screen not listed in section 6,** read sections 0–5 again and ask: where does this fit? It will almost always be a variation of (Shell + header + tabs + list of PlayerRows).
7. **Resist adding novelty.** The whole point of this overhaul is consistency. If a screen feels boring, that's correct — the data is the show.

---

## 9. Files in this handoff

- `tokens.css` — section 1, ready to import
- `FORZAKIT-UI-Overhaul.md` — this document
- The mocked screens are reference: `FORZAKIT Final.html` plus its supporting `*.jsx` files in the project.

Hand the markdown + tokens.css to Claude Code along with the URL of `FORZAKIT Final.html` for visual reference. Ask it to refactor existing screens against this spec one feature area at a time, starting with the shared `<Shell>` and `<PlayerRow>` primitives.
