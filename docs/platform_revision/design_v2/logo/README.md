# Handoff: Frontrow Logo System

## Overview
FantasyKit is rebranding to **Frontrow** — key sentence: *"Your seat to all the action."* This package contains the finalized logo and its multi-sport extensions, built for the platform's **Kit (Light)** visual direction.

## About the Design Files
The SVGs in `assets/` are **hand-built reference vector assets**, created as the design source of truth — not throwaway mockups. They are safe to use directly as icon/logo assets, but recreate the "live" pulse/glow behavior using your codebase's own animation approach (CSS/Framer Motion/etc.) rather than relying on the embedded SVG `<style>` animations, which are reference-only.

## Fidelity
**High-fidelity.** Exact colors, proportions, and construction below. Nothing here should be reinterpreted.

## Logo family

### 1. Primary logo — "The Tiers"
Three horizontal bars, left-aligned, stacked with an 6px gap, radius 4px, heights 11px (at the 80×45 viewBox scale):
- Bar 1 (top): width 26, color `--gold` `#B8720E` — the front row, closest to the action
- Bar 2 (middle): width 48, color `--accent` `#1A6FA8`
- Bar 3 (bottom): width 70, color `--accent` `#1A6FA8`

Files: `frontrow-logo-primary.svg` (static — use everywhere: nav, marketing, wordmark lockups) and `frontrow-logo-live.svg` (bar 1 has a soft breathing gold halo — reserved for **live states only**: live-score badges, in-play indicators, Live Centre. Never use the live variant as the static wordmark icon.)

### Wordmark
"Frontrow" set in **Archivo Black**, mixed case (not all-caps). Pair icon + wordmark with icon height ≈ wordmark cap-height, ~14px gap. On dark surfaces (`--shell` `#18202E`) the wordmark and any UI chrome flip to `#F7F3ED` (warm white) — never pure white.

### 2. Multi-sport marks
Each sport gets its **own dedicated glyph** (not a forced reuse of The Tiers bars) so the family can grow. What ties every sport mark to Frontrow:
- Same chrome: 104×104 rounded-square badge, 24px radius, white fill, 1px `#E2DDD5` border
- Same gold signature dot (`#B8720E`, 4px radius) in the top-right corner — **live variant only**, pulsing (scale 1→2.6, fade out, 1.8s loop)
- Same stroke weight (~2.5px) and "top-view diagram" logic: every glyph is a bird's-eye line drawing of where that sport is played

| Sport | Glyph | Color (oklch) | Hex fallback |
|---|---|---|---|
| Football | Top-view pitch: outline + halfway line + center circle | `oklch(0.52 0.12 152)` | `#1E7A4C` |
| Tennis | Top-view court: outline + net + service lines + center marks | `oklch(0.5 0.14 300)` | `#7A3FA0` |
| F1 | Top-view circuit: smooth closed-loop track outline + start/finish tick | `oklch(0.55 0.16 28)` | `#C7402B` |

Files per sport: `frontrow-<sport>-normal.svg` (default) and `frontrow-<sport>-live.svg` (adds the pulsing gold dot — use when that sport has a live event in progress).

**Adding a new sport later:** keep the same badge chrome + gold dot rule, draw a new bird's-eye top-view glyph of that sport's playing surface, and pick a new hue at the same lightness/chroma family (`L ≈ 0.5–0.55, C ≈ 0.12–0.16`) so it stays visually related to football/tennis/F1 without repeating a color.

## Design tokens (Kit Light — do not invent new values)
| Token | Value |
|---|---|
| `--bg` | `#F7F3ED` |
| `--card` | `#FFFFFF` |
| `--elev` | `#EDEAE2` |
| `--shell` | `#18202E` (the one dark surface — sidebar/shell only) |
| `--text` | `#18202E` |
| `--text-2` | `#4B5568` |
| `--mute` | `#8A97A8` |
| `--rule` | `#E2DDD5` |
| `--accent` | `#1A6FA8` |
| `--gold` | `#B8720E` |
| Typography | Archivo Black (display/wordmark), Archivo (body/UI), JetBrains Mono (labels — sparingly) |
| Radius | 6px throughout the product UI; logo badge chrome uses 24px (larger, decorative) |

## Assets
```
assets/
  frontrow-logo-primary.svg      Primary logo, static
  frontrow-logo-live.svg         Primary logo, breathing live state
  frontrow-football-normal.svg
  frontrow-football-live.svg
  frontrow-tennis-normal.svg
  frontrow-tennis-live.svg
  frontrow-f1-normal.svg
  frontrow-f1-live.svg
```
All are plain vector SVGs (no external font/image dependencies) — safe to import directly as icon assets or convert to your app's icon-component pattern.

## Files
`reference/Frontrow Logo Concepts.html` — the original interactive exploration canvas (all rejected directions removed), useful for visual context on how these marks read at different sizes and lockups. Not for direct reuse — the SVGs in `assets/` are the source of truth.
