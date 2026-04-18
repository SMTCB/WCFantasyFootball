# FantasyKit — Application Dynamics & Overview

This document provides a technical and functional blueprint of how FantasyKit operates. It serves as the source of truth for generating instruction manuals and onboarding users.

---

## 📅 THE MATCHDAY CYCLE

FantasyKit operates in a three-phase cycle:

### 1. Pre-Match (Strategic Prep)
- **Squad Building**: Users manage a 15-man squad (2 GK, 5 DF, 5 MID, 3 FWD).
- **The Market**: Players are purchased using a limited budget. Constraints include:
    - Max 3 players per Country.
    - Mandatory position counts.
- **Captaincy**: One player in the starting XI is nominated as Captain (2× points).
- **Daily Joker**: Each matchday, users can nominate one player playing that day as a "Joker" (exempt from country limits, cannot be changed once locked).
- **Daily Prediction — Top Scorer** ✅ *LIVE — Home Screen*:
    - Before squad lock, users make a single prediction: which player will score the most goals in the matchday.
    - **Scoring**: Correct pick = +5 pts added to matchday total. Wrong = 0 pts. Tie = 0 pts (neutral).
    - **UI**: "🎯 Daily Prediction" card on the Home Screen. Tapping "Make Pick" opens a bottom sheet with a searchable player list sorted by predicted goals.
    - **State Machine**: No prediction → Pick made (changeable) → Locked at matchday start → Result revealed (✅ +5 pts / ❌ 0 pts).
    - **Data**: Stored in `top_scorer_predictions` table with UPSERT to allow pick changes before lock.
- **Danger Zone — Injury Alerts & Predicted Lineups** ✅ *LIVE — `/squad` screen*:
    - A collapsible warning panel above the pitch view lists all squad players at risk of not playing.
    - **Status tiers**: 🟢 Likely (≥75%) / 🟡 Doubtful / 🟠 Expected Bench / 🔴 Confirmed OUT.
    - Each alert shows player name, position, confidence %, and a human-readable reason (e.g. "Minor hamstring tightness — training reduced this week").
    - OUT players display an "Auto-sub?" badge. Tapping any alert opens the player's action sheet for fast transfer.
    - **PlayerCard intelligence dots**: Every player card on the pitch and bench shows a coloured status dot in the top-left corner, a subtle red border ring for at-risk players, and an amber name label for doubtful/bench cases.
    - **Engine**: `lib/intelligence.js` — player status registry mapping player IDs to `{ status, confidence, reason }`.
- **Lock Time**: Squads lock exactly at the first kick-off of the matchday. No transfers or changes allowed after this point.

### 2. Live Match (Engagement)
- **Live Scoring**: Points accumulate in real-time based on fixture events (goals, assists, clean sheets, cards).
- **Live Projections** ✅ *LIVE — `/live` screen*:
    - During each matchday, the app calculates a **projected final score** for the user and all rivals.
    - **Engine** (`lib/projections.js`): `projected = current_pts + Σ(player_avg_per_90 × remaining_min / 90)` per active player. Conservative: always floors, never overstates.
    - **Position Averages**: GK 2.1 / DEF 2.8 / MID 3.2 / FWD 4.1 pts per 90 min.
    - **UI**: Large "Projected FT" number next to live score, with trend arrow (↑ green / ↓ red / — grey). A two-tone progress bar visualises the live vs projected gap. Automatically refreshes every 5 minutes; smooths extreme swings (±5 pts cap per cycle).
    - **Rival Watch**: Each rival row shows `+N live` pill and `→ N proj.` sub-label.
    - **Match Progress**: Fixture ticker cards show a green progress bar for % of match played.
- **Activity Log**: A chronological feed of match events (⚽ goals, 🟨 yellows, 🟥 reds, ↕️ subs, 📺 VAR) with point impact per event.
- **VAR (Upcoming)**: Temporary "📺 Under Review" states that resolve into `Stands` or `Reversed`.

### 3. Post-Match (Growth & Review)
- **Settlement**: Final points are tallied, and league standings are updated.
- **Matchday Recap Card** ✅ *LIVE — `/recap`*:
    - After each matchday, a personalized recap is generated for every user.
    - **Content**: Final rank, points scored, rank change (↑↓), best player, captain performance (×2 pts), Joker played (if active), and transfers made.
    - **Shareability**: Users can tap **"Share Recap"** to (a) invoke the device's native Share Sheet (WhatsApp, Telegram, Instagram Stories, etc.) with an auto-generated PNG or (b) copy the result as text. The PNG is generated client-side using `html2canvas` — no server required.
    - **Home Screen Teaser**: A dismissible banner above the match list announces "Matchday {N} Recap Ready" and links to `/recap`.
    - **Route**: `/recap` — accessible from the Home Screen teaser.
- **League Analytics (Upcoming)**: Aggregate trends (most popular captain, biggest upset) available in the Stats tab.

---

## 🧬 KEY ENGINE DYNAMICS

### Selection Logic & Constraints
- **Nationality Cap**: To prevent "clone squads," users are limited to 3 players from the same nation.
- **Joker Exemption**: The Daily Joker allows users to bypass the nationality cap for one strategic pick.
- **Points Engine**:
    - Starters get full points.
    - Bench players only contribute if a starter doesn't play (automatic substitution logic).
    - Captains provide a 2× multiplier (or 3× if the **Triple Captain Chip** is active).

### Social Interaction Mechanics
- **Banter Logic**: The app automatically identifies "Pain Points" or "Bragging Rights" (e.g., a player on your bench scoring a brace) and creates "Call-out Cards" on the Activity Wall.
- **Head-to-Head Rivalry** - LIVE (Feature 05):
    - Tapping "H2H" on any rival in the League Leaderboard opens a full bottom sheet.
    - Shows W/D/L scoreboard, win % bar, SVG sparkline (you vs rival per matchday), and milestone cards (Biggest Win / Biggest Loss / Closest Match).
    - Streak badges: Win streak (green) or Loss streak (red) displayed inline.
    - Separate "Trade" and "H2H" action buttons per leaderboard row.

### Economy (The Market)
- **Dynamic Pricing**: (Planned) Player prices fluctuate based on matchday performance and transfer popularity.
- **Wildcard Chip**: A one-time escape hatch allowing a user to reset their entire squad for free.

---

## 📂 DIRECTORY STRUCTURE FOR DEVELOPERS
- `/src/screens`: UI screens (Squad, Market, Live, etc.)
- `/src/components`: UI atoms like `PlayerCard` and `PitchView`.
- `/src/lib`: Database/Supabase client logic.
- `/supabase/migrations`: Database schema (Players, Squads, Fixtures).
