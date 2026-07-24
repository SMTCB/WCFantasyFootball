# FORZAKIT — Message Components v1.0

## Contents

| File | Description |
|------|-------------|
| `Message Components.html` | Design canvas — all components rendered at actual size, desktop + mobile. Open in any browser, works offline. |
| `guidelines.html` | Usage guidelines — when to use each type and format, do's & don'ts, copy tone, tokens. |
| `tokens.css` | FORZAKIT design tokens — drop into the app root and import once globally. |

---

## Quick reference

### Types
| Token | Colour | Use for |
|-------|--------|---------|
| `--positive` | `#22C55E` | SUCCESS — action completed |
| `--warn` | `#F59E0B` | WARNING — at risk, act now |
| `--danger` | `#EF4444` | ERROR — action failed |
| `--cyan` | `#00B4D8` | INFO — neutral system update |

### Formats
| Format | Platform | Auto-dismiss | Use when |
|--------|----------|--------------|----------|
| Inline Banner (dismissible) | Desktop + Mobile | Yes, 8s (success only) | Direct response to a user action |
| Inline Banner (with actions) | Desktop + Mobile | Never | User must choose a next step |
| Toast | Desktop + Mobile | Yes, 4–6s | Background event, no decision needed |
| System Banner | Desktop only | No | Persistent page-wide state |
| Mobile Action Sheet | Mobile only | Never | Interrupting decision on mobile |

---

## Usage pattern

All message backgrounds use `color-mix()` for tinting — no hardcoded alpha values:

```css
/* Banner background */
background: color-mix(in srgb, var(--signal) 9%, var(--ink-2));

/* Top/left border */
border-color: color-mix(in srgb, var(--signal) 22%, transparent);

/* Icon container */
background: color-mix(in srgb, var(--signal) 14%, transparent);
```

Where `--signal` is one of `--positive`, `--warn`, `--danger`, or `--cyan`.

---

FORZAKIT · June 2026
