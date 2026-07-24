# Data Classification — Forza Fantasy League

**GDPR/Data-protection reference for all personal data stored in the production Supabase project (`sssmvihxtqtohisghjet`).**

---

## Summary

| Category | Tables | Retention | Legal basis |
|----------|--------|-----------|-------------|
| **Identity** | `users` | Account lifetime + 30 days post-deletion | Contract (account) |
| **Gameplay** | `squads`, `fantasy_points`, `league_members`, `transfers`, `draft_allocations` | Lifetime of the league | Legitimate interest (game history) |
| **Communications** | `chat_messages`, `clubhouse_messages`, `direct_messages` | Delete on request | Consent |
| **Social interactions** | `frontpage_reactions`, `frontpage_comments`, `gazette_entries` | Delete on request | Consent |
| **Predictions / submissions** | `draft_submissions`, `bet_submissions`, `knockout_keep_submissions` | Delete on request | Contract |
| **Financial (coins)** | `coin_wallets`, `coin_transactions` | Delete on request (wallet + ledger) | Contract |
| **Sport picks** | `f1_bets_race`, `f1_bets_year`, `tennis_rosters`, `tennis_ace_cards`, `tennis_atp_finals_picks`, `tennis_tournament_scores` | Delete on request | Contract |
| **Competitive records** | `h2h_schedule`, `h2h_records`, `trophy_ledger`, `squad_events` | Anonymised on request | Legitimate interest |
| **Notifications** | `league_notifications`, `clubhouse_notifications`, `league_chat_read_status` | Delete on request | Legitimate interest |
| **Diagnostics** | `client_errors`, `edge_function_errors` | 90 days (cron prune) | Legitimate interest |

---

## Field-level PII Inventory

### `users`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `id` | Pseudonymous key | **Kept** (FK anchor) |
| `username` | Display name | **Overwritten** → `[deleted-{uid8}]` |
| `avatar_url` | Profile picture URL | **Nulled** |
| `xp` | Gameplay score | Kept (anonymised) |
| `badges` | Gameplay achievements | Kept (anonymised) |
| `is_admin` | Role flag | Kept (anonymised) |
| `created_at` | Join timestamp | Kept (anonymised) |

### `chat_messages` / `clubhouse_messages` / `direct_messages`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` / `from_user_id` / `to_user_id` | Identity | **Row deleted** |
| `content` | Free text (may contain PII) | **Deleted** with row |

### `league_members`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` | Identity | **Row deleted** (cascades `matchday_recaps`) |
| `total_points`, `rank` | Gameplay | Deleted with row |

### `squads`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` | Identity | **Set NULL** |
| `players`, `captain_id`, `starting_xi` | Gameplay | Kept (anonymous) |
| `budget_remaining`, `round_transfers` | Gameplay | Kept (anonymous) |

### `fantasy_points`

No direct user_id — joined via `squad_id`. Kept intact; the squad row is retained with `user_id=NULL`, so this table is effectively anonymised by the squad update.

### `transfers`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` | Identity | **Set NULL** |
| `player_in`, `player_out`, `price` | Gameplay/financial | Kept (anonymous) |

### `coin_wallets` / `coin_transactions`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` | Identity | **Row deleted** (wallet deletion cascades transactions) |
| `balance`, `amount`, `type` | Financial | Deleted with row |

### `squad_events`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` | Identity | **Set NULL** |
| `event_type`, `player_in`, `player_out` | Gameplay audit | Kept (anonymous) |

### `h2h_schedule` / `h2h_records`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `home_user_id`, `away_user_id`, `bye_user_id`, `user_a_id`, `user_b_id`, `winner_id` | Identity | **Set NULL** |
| Scores, points | Gameplay | Kept (anonymous) |

### `trophy_ledger`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `user_id` | Identity | **Set NULL** |
| Trophy type, count | Gameplay | Kept (anonymous) |

### `p2p_challenges`

| Column | PII type | Action on erasure |
|--------|----------|-------------------|
| `challenger_id`, `opponent_id` | Identity | Pending challenges **deleted**; settled → **set NULL** |
| `stake_coins`, `status` | Financial/game | Kept (anonymous) for settled |

### Sport picks (F1, Tennis)

All user_id columns: **row deleted** on erasure. These are pure user submissions with no league-history dependency.

### `draft_submissions` / `knockout_keep_submissions` / `bet_submissions`

**Rows deleted** — these are user preferences/choices, not league-structural data.

### `frontpage_reactions` / `frontpage_comments`

**Rows deleted** — user-generated social content.

### `client_errors`

User-linked rows: **deleted**. Remaining rows (no user_id): pruned by 90-day cron.

### `edge_function_errors`

No user_id by default (server-side logs). Contains no direct PII. Retained for 90 days per cron prune.

---

## Retention Schedule

| Event | Action |
|-------|--------|
| User calls `delete_user_data()` | Immediate deletion/anonymisation per table above |
| Account closure (auth.users deletion) | FK `ON DELETE CASCADE` on `league_members`, `chat_messages`, `coin_wallets`, etc. trigger DB-level delete |
| `client_errors` > 90 days | Pruned by `prune-error-logs` cron |
| `edge_function_errors` > 90 days | Pruned by `prune-error-logs` cron |
| League deleted | Cascades to `league_members`, `squads`, `chat_messages`, `gazette_entries`, etc. |

---

## Data Flows — Third Parties

| Recipient | Data shared | Purpose | DPA in place? |
|-----------|-------------|---------|---------------|
| **Supabase** (US, EU-hosted bucket selectable) | All tables — hosted infra | Database, auth, storage | Yes (Supabase DPA) |
| **Vercel** (US) | None — frontend only; no PII in environment | Hosting | Standard ToS |
| **Forza Football API** | None — read-only pull of match/player data | Live scores | No PII sent |
| **Sentry** (US) | Error context (function name, severity, stack) | Observability — NO user_id sent | Yes (Sentry DPA) |
| **Groq** (US) | League standings, gazette snippets, chat excerpts | AI frontpage generation | ⚠️ Review before launch — may need DPA or data-minimisation |

---

## GDPR Rights Implementation

| Right | Mechanism |
|-------|-----------|
| **Access** | `GET /api/me` (future) — export all rows keyed by `user_id` |
| **Erasure** | `delete_user_data(user_id)` RPC — migration 219 |
| **Rectification** | `UPDATE users SET username=... WHERE id=auth.uid()` (SettingsScreen) |
| **Portability** | Not yet implemented — BACKLOG item |
| **Objection** | Contact commissioner or admin — no automated flow yet |

---

Last Updated: **2026-07-01**
