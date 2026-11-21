# S32 design lock: screenshots

The pitch, player icons, crests and the player sheet stay exactly as they were (owner's design lock, 2026-11-21). S32 changed only the layout around them.

- **Desktop.** The side column (340px) now sits to the right of the pitch, so at a given window width the pitch area is 340px narrower. The pitch itself scales with its area, as before. Proof: `before-1100-pitch.png` (old code, 1100px window) and `after-1440-pitch.png` (new code, 1440px window) give the pitch the same 1100px area. Both are 1100x676 and look the same; `diff-pitch-before-1100-vs-after-1440.png` marks the pixels that differ by more than 8/255 (688 of 743,600, all antialiasing at edges, from a different vertical offset).
- **Player sheet.** `before-*-sheet.png` and `after-*-sheet.png`: the same sheet.
- **Phone (375px).** `after-375-*.png` is pixel-identical to S31 (`../s31-design-lock/after-375-*.png`).
- **New on desktop.** `after-1280-desktop-view.png`, `after-1440-desktop-view.png` and the `*-side-column.png` crops: Needs attention, Chips and This round's matches.

Related: [LEAGUE_MY_TEAM_PLAN_2026-11-21.md](../../product/LEAGUE_MY_TEAM_PLAN_2026-11-21.md), [s31-design-lock/](../s31-design-lock/).

Last Updated: 2026-11-21
