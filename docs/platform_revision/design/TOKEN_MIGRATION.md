# Token Migration — Dark Forza → Kit Light

**Use this when porting any component from the dark handoff READMEs into Kit Light.**

The dark handoff files (`design_handoffs/league_hub/`, `design_handoffs/live_centre/`, etc.) reference old dark token names with dark values. Every time you see one of those names in a spec, substitute the Kit Light equivalent below.

---

## Surface tokens

| Dark handoff token | Dark value | Kit Light token | Kit Light value |
|---|---|---|---|
| `--ink` | `#080A0E` | `--bg` | `#F7F3ED` |
| `--ink-2` | `#0F1218` | `--card` | `#FFFFFF` |
| `--ink-3` | `#161B25` | `--elev` | `#EDEAE2` |
| `--rule` | `#1E2530` | `--rule` | `#E2DDD5` ⚠️ same name, different value |
| *(no equivalent)* | — | `--shell` | `#18202E` (sidebar / sticky headers only) |

## Text tokens

| Dark handoff token | Dark value | Kit Light token | Kit Light value |
|---|---|---|---|
| `--paper` | `#F2EEE5` | `--paper` | `#18202E` ⚠️ same name, INVERTED meaning |
| `--mute` | `#8B95A1` | `--mute` | `#8A97A8` ⚠️ same name, nearly same value |
| *(no equivalent)* | — | `--text-2` | `#4B5568` |

> `--paper` is the most dangerous substitution. In the dark direction it was cream/white foreground text. In Kit Light it is dark navy — the primary text colour. On a dark shell surface (`--shell`), never use `var(--paper)` for text — use `#fff` or `rgba(255,255,255,...)`.

## Accent tokens

| Dark handoff token | Dark value | Kit Light token | Kit Light value |
|---|---|---|---|
| `--cyan` | `#00B4D8` | `--accent` | `#1A6FA8` |
| *(no equivalent)* | — | `--accent-bg` | `rgba(26,111,168,.08)` |
| `--gold` | `#E0A800` | `--gold` | `#B8720E` ⚠️ same name, different value (darker, more muted) |
| `--positive` | `#22C55E` | `--pos` | `#166534` ⚠️ same concept, darker value |
| `--danger` | `#EF4444` | `--neg` | `#B91C1C` ⚠️ same concept, darker value |
| `--purple` | `#A855F7` | `--pos-gk` | `#8C49C9` ⚠️ same concept, different value |
| `--warn` | `#F59E0B` | `--warn` | `#B8720E` (shares gold tone) |

> `--positive` → `--pos` and `--danger` → `--neg` are significant shifts. The old neon values (`#22C55E`, `#EF4444`) were designed for dark backgrounds. The new values (`#166534`, `#B91C1C`) are darker and read better on light surfaces. On the dark `--shell` header, use light variants instead: `#4ADE80` for positive, `#F87171` for danger.

## Position tones

| Dark handoff token | Kit Light token | Value |
|---|---|---|
| `--cyan` (DEF) | `--pos-def` | `#1A6FA8` |
| `--gold` (MID) | `--pos-mid` | `#B8720E` |
| `--danger` (FWD) | `--pos-fwd` | `#B91C1C` |
| `--purple` (GK) | `--pos-gk` | `#8C49C9` |

## Component-specific notes

### DeltaPill
Dark spec: `#22C55E` positive / `#EF4444` danger.  
Kit Light: use `var(--pos)` (`#166534`) / `var(--neg)` (`#B91C1C`).  
On dark shell surfaces: use `#4ADE80` / `#F87171`.

### MiniTok / player pitch tokens
Dark spec: `background: rgba(15,18,24,.94)` (near-black card).  
Kit Light on green pitch (`#2D5A27`): use `var(--card)` (`#FFFFFF`) with a light box shadow for lift.  
Left-edge position tone: substitute as per position tones table above.

### HubActionBar (MANAGE SQUAD + MARKET strip)
**Removed in Kit Light.** Do not implement. Squad and Market are top-level nav items — no dual CTA bar inside the league hub. See BRIEF.md.

### Border radius
Dark handoff uses 0–4px (intentionally sharp). Kit Light uses `6px` throughout (`--radius-md`). Apply 6px to all components when porting.

### Capitalisation
Dark handoff uses ALL CAPS for most labels. Kit Light uses Mixed Case for UI text. Eyebrow labels (small mono metadata) remain UPPERCASE — that's the exception, not the rule.

---

## White-label cascade

The `--accent` token feeds through `--brand-accent` so operators can re-skin with a single override:

```css
:root {
  --brand-accent: #1A6FA8;          /* operator overrides this one value */
  --accent:       var(--brand-accent);
  --accent-bg:    color-mix(in srgb, var(--brand-accent) 8%, transparent);
  --pos-def:      var(--brand-accent);   /* DEF position tone follows accent */
}
```

A La Liga skin sets `--brand-accent: #CF1732` and every button, active state, DEF badge, and accent tint updates automatically.

---

*Last updated: 2026-06-22*
