# Trade Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers propose bilateral player swaps (with optional cash and points sweeteners) to other managers in the same league, with accept/reject/cancel flows.

**Architecture:** Player ownership lives in `squads.players TEXT[]`. A trade swap is a single atomic SQL transaction that array-removes/adds player IDs on two squad rows and adjusts `budget_remaining` on both sides. The backend is four SECURITY DEFINER RPCs in migration 85. The frontend adds a `useTradeProposals` hook and an incoming-proposals panel inside `LeagueScreen`. The existing `league_notifications` table is reused to alert the target manager.

**Tech Stack:** PostgreSQL (array ops, transactions, SECURITY DEFINER RPCs), React hooks, Supabase Realtime, existing `league_notifications` + `useNotifications` pattern.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/85_trade_proposals.sql` | Create | Table + RLS + 4 RPCs + notification insert |
| `src/hooks/useTradeProposals.js` | Create | Fetch/subscribe incoming+outgoing proposals; expose accept/reject/cancel |
| `src/screens/LeagueScreen.jsx` | Modify | Import hook; add incoming proposals panel; wire `validateAndSendProposal` |

---

## Task 1 — Migration 85: `trade_proposals` table + RPCs

**Files:**
- Create: `supabase/migrations/85_trade_proposals.sql`

### Schema decisions (read before writing SQL)

- `cash_sweetener NUMERIC(6,1)`: positive = proposer pays target; negative = target pays proposer
- `points_sweetener INT DEFAULT 0`: always deducted from proposer's `league_members.total_points`
- `status TEXT CHECK (status IN ('pending','accepted','rejected','cancelled','expired'))` — default `'pending'`
- `expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours')` — auto-expiry grace
- RPCs use `SECURITY DEFINER` so they can write cross-user squad rows (same reason `process-transfer` uses SERVICE_ROLE)
- `auth.uid()` works inside SECURITY DEFINER; use it to verify the caller

---

- [ ] **Step 1.1 — Write `85_trade_proposals.sql`**

```sql
-- supabase/migrations/85_trade_proposals.sql

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_proposals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  proposer_squad_id   UUID        NOT NULL REFERENCES squads(id)  ON DELETE CASCADE,
  target_squad_id     UUID        NOT NULL REFERENCES squads(id)  ON DELETE CASCADE,
  proposer_player_id  TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_player_id    TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cash_sweetener      NUMERIC(6,1) NOT NULL DEFAULT 0,
  points_sweetener    INT          NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected','cancelled','expired')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_trade_proposals_proposer ON trade_proposals(proposer_squad_id, status);
CREATE INDEX idx_trade_proposals_target   ON trade_proposals(target_squad_id,   status);
CREATE INDEX idx_trade_proposals_league   ON trade_proposals(league_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE trade_proposals ENABLE ROW LEVEL SECURITY;

-- Any league member can read proposals in their league
CREATE POLICY "trade_proposals_select"
  ON trade_proposals FOR SELECT
  USING (
    league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  );

-- Inserts are via RPC (SECURITY DEFINER), direct inserts blocked
CREATE POLICY "trade_proposals_insert_denied"
  ON trade_proposals FOR INSERT
  WITH CHECK (false);

-- Updates are via RPC (SECURITY DEFINER), direct updates blocked
CREATE POLICY "trade_proposals_update_denied"
  ON trade_proposals FOR UPDATE
  USING (false);

-- ─── RPC: submit_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_trade_proposal(
  p_league_id          UUID,
  p_proposer_squad_id  UUID,
  p_target_squad_id    UUID,
  p_proposer_player_id TEXT,
  p_target_player_id   TEXT,
  p_cash_sweetener     NUMERIC DEFAULT 0,
  p_points_sweetener   INT     DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposer_user_id UUID;
  v_proposer_players TEXT[];
  v_target_players   TEXT[];
  v_proposer_budget  NUMERIC;
  v_proposer_points  NUMERIC;
BEGIN
  -- Verify caller owns proposer squad
  SELECT user_id, players, budget_remaining
    INTO v_proposer_user_id, v_proposer_players, v_proposer_budget
    FROM squads WHERE id = p_proposer_squad_id AND league_id = p_league_id;

  IF v_proposer_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SQUAD_NOT_FOUND');
  END IF;

  IF v_proposer_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_YOUR_SQUAD');
  END IF;

  -- Verify target squad exists in same league
  SELECT players INTO v_target_players
    FROM squads WHERE id = p_target_squad_id AND league_id = p_league_id;

  IF v_target_players IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_SQUAD_NOT_FOUND');
  END IF;

  -- Verify proposer owns their player
  IF NOT (p_proposer_player_id = ANY(v_proposer_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NOT_IN_SQUAD');
  END IF;

  -- Verify target owns their player
  IF NOT (p_target_player_id = ANY(v_target_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NOT_IN_SQUAD');
  END IF;

  -- Validate proposer budget covers positive cash sweetener (paying out cash)
  IF p_cash_sweetener > 0 THEN
    IF v_proposer_budget < p_cash_sweetener THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BUDGET');
    END IF;
  END IF;

  -- Validate proposer has enough points for sweetener
  IF p_points_sweetener > 0 THEN
    SELECT total_points INTO v_proposer_points
      FROM league_members WHERE league_id = p_league_id AND user_id = auth.uid();
    IF v_proposer_points < p_points_sweetener THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_POINTS');
    END IF;
  END IF;

  -- Insert proposal
  INSERT INTO trade_proposals (
    league_id, proposer_squad_id, target_squad_id,
    proposer_player_id, target_player_id,
    cash_sweetener, points_sweetener
  ) VALUES (
    p_league_id, p_proposer_squad_id, p_target_squad_id,
    p_proposer_player_id, p_target_player_id,
    p_cash_sweetener, p_points_sweetener
  );

  -- Notify the target squad owner
  INSERT INTO league_notifications (
    league_id, user_id, notification_type,
    triggered_by_user_id, title, description,
    related_entity_id, related_entity_type
  )
  SELECT
    p_league_id,
    s.user_id,
    'trade_proposal',
    auth.uid(),
    'New Trade Offer',
    (SELECT name FROM players WHERE id = p_proposer_player_id)
      || ' for '
      || (SELECT name FROM players WHERE id = p_target_player_id),
    tp.id,
    'trade_proposal'
  FROM squads s
  CROSS JOIN (
    SELECT id FROM trade_proposals
    WHERE proposer_squad_id = p_proposer_squad_id
      AND target_player_id = p_target_player_id
    ORDER BY created_at DESC LIMIT 1
  ) tp
  WHERE s.id = p_target_squad_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: accept_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_trade_proposal(
  p_proposal_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal        trade_proposals%ROWTYPE;
  v_target_user_id  UUID;
  v_proposer_budget NUMERIC;
  v_target_budget   NUMERIC;
  v_prop_players    TEXT[];
  v_tgt_players     TEXT[];
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  IF v_proposal.expires_at < NOW() THEN
    UPDATE trade_proposals SET status = 'expired', resolved_at = NOW()
      WHERE id = p_proposal_id;
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_EXPIRED');
  END IF;

  -- Caller must own the target squad
  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;
  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  -- Re-check players still in squads (may have changed since proposal)
  SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget
    FROM squads WHERE id = v_proposal.proposer_squad_id;
  SELECT players, budget_remaining INTO v_tgt_players, v_target_budget
    FROM squads WHERE id = v_proposal.target_squad_id;

  IF NOT (v_proposal.proposer_player_id = ANY(v_prop_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;
  IF NOT (v_proposal.target_player_id = ANY(v_tgt_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;

  -- Atomic swap: move players
  -- Proposer squad: remove their player, add target player
  UPDATE squads
    SET players = array_remove(players, v_proposal.proposer_player_id)
                  || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener  -- positive = proposer paid, so proposer loses, target gains
    WHERE id = v_proposal.proposer_squad_id;

  -- Target squad: remove their player, add proposer's player
  UPDATE squads
    SET players = array_remove(players, v_proposal.target_player_id)
                  || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener  -- target receives cash if positive
    WHERE id = v_proposal.target_squad_id;

  -- Deduct points sweetener from proposer
  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id
        AND user_id = (SELECT user_id FROM squads WHERE id = v_proposal.proposer_squad_id);
  END IF;

  -- Mark this proposal accepted
  UPDATE trade_proposals
    SET status = 'accepted', resolved_at = NOW()
    WHERE id = p_proposal_id;

  -- Cancel other pending proposals that involved either traded player
  UPDATE trade_proposals
    SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id
      AND status = 'pending'
      AND (
        proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
        OR target_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
      )
      AND (
        proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
        OR target_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
      );

  -- Notify proposer that their offer was accepted
  INSERT INTO league_notifications (
    league_id, user_id, notification_type,
    triggered_by_user_id, title, description,
    related_entity_id, related_entity_type
  )
  SELECT
    v_proposal.league_id,
    s.user_id,
    'trade_accepted',
    auth.uid(),
    'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id)
      || ' is now in your squad',
    p_proposal_id,
    'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: reject_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_trade_proposal(
  p_proposal_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal       trade_proposals%ROWTYPE;
  v_target_user_id UUID;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  UPDATE trade_proposals
    SET status = 'rejected', resolved_at = NOW()
    WHERE id = p_proposal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: cancel_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_trade_proposal(
  p_proposal_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal          trade_proposals%ROWTYPE;
  v_proposer_user_id  UUID;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_proposer_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_PROPOSER');
  END IF;

  UPDATE trade_proposals
    SET status = 'cancelled', resolved_at = NOW()
    WHERE id = p_proposal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
```

- [ ] **Step 1.2 — Apply the migration**

```bash
npx supabase db query --linked --file supabase/migrations/85_trade_proposals.sql
```

Expected: No errors. If you see `ERROR: table "trade_proposals" already exists`, the migration was already partially applied — run `DROP TABLE IF EXISTS trade_proposals CASCADE;` first, then re-run.

- [ ] **Step 1.3 — Verify table and RPCs exist**

```bash
npx supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_name = 'trade_proposals';"
npx supabase db query --linked "SELECT proname FROM pg_proc WHERE proname LIKE '%trade_proposal%';"
```

Expected output for second query:
```
submit_trade_proposal
accept_trade_proposal
reject_trade_proposal
cancel_trade_proposal
```

- [ ] **Step 1.4 — Commit**

```bash
git add supabase/migrations/85_trade_proposals.sql
git commit -m "feat: migration 85 — trade_proposals table + submit/accept/reject/cancel RPCs"
```

---

## Task 2 — `useTradeProposals` hook

**Files:**
- Create: `src/hooks/useTradeProposals.js`

This hook fetches both incoming (proposals targeting my squad) and outgoing (proposals I sent) for the active league. It also subscribes to Realtime `INSERT`/`UPDATE` events on `trade_proposals` for the league so panels refresh without polling.

- [ ] **Step 2.1 — Create `src/hooks/useTradeProposals.js`**

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useTradeProposals(leagueId, mySquadId) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!leagueId || !mySquadId) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('trade_proposals')
      .select(`
        id, league_id, status, cash_sweetener, points_sweetener,
        created_at, expires_at, resolved_at,
        proposer_squad_id, target_squad_id,
        proposer_player_id, target_player_id,
        proposer_player:players!trade_proposals_proposer_player_id_fkey(id, name, position),
        target_player:players!trade_proposals_target_player_id_fkey(id, name, position)
      `)
      .eq('league_id', leagueId)
      .in('status', ['pending'])
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }

    setIncoming((data || []).filter(p => p.target_squad_id  === mySquadId));
    setOutgoing((data || []).filter(p => p.proposer_squad_id === mySquadId));
    setLoading(false);
  }, [leagueId, mySquadId]);

  // Subscribe to any INSERT or UPDATE on trade_proposals for this league
  useEffect(() => {
    if (!leagueId) return;

    channelRef.current = supabase
      .channel(`trade-proposals-${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trade_proposals',
        filter: `league_id=eq.${leagueId}`,
      }, () => load())
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [leagueId, load]);

  useEffect(() => { load(); }, [load]);

  const submitProposal = useCallback(async ({
    targetSquadId, myPlayerId, theirPlayerId, cashSweetener, pointsSweetener,
  }) => {
    const { data, error: err } = await supabase.rpc('submit_trade_proposal', {
      p_league_id:          leagueId,
      p_proposer_squad_id:  mySquadId,
      p_target_squad_id:    targetSquadId,
      p_proposer_player_id: myPlayerId,
      p_target_player_id:   theirPlayerId,
      p_cash_sweetener:     cashSweetener,
      p_points_sweetener:   pointsSweetener,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [leagueId, mySquadId, load]);

  const acceptProposal = useCallback(async (proposalId) => {
    const { data, error: err } = await supabase.rpc('accept_trade_proposal', {
      p_proposal_id: proposalId,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [load]);

  const rejectProposal = useCallback(async (proposalId) => {
    const { data, error: err } = await supabase.rpc('reject_trade_proposal', {
      p_proposal_id: proposalId,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [load]);

  const cancelProposal = useCallback(async (proposalId) => {
    const { data, error: err } = await supabase.rpc('cancel_trade_proposal', {
      p_proposal_id: proposalId,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [load]);

  return {
    incoming, outgoing, loading, error,
    submitProposal, acceptProposal, rejectProposal, cancelProposal,
    reload: load,
  };
}
```

- [ ] **Step 2.2 — Run ESLint to catch any issues**

```bash
npx eslint src/hooks/useTradeProposals.js
```

Expected: 0 errors.

- [ ] **Step 2.3 — Commit**

```bash
git add src/hooks/useTradeProposals.js
git commit -m "feat: useTradeProposals hook — fetch, subscribe, submit/accept/reject/cancel"
```

---

## Task 3 — Incoming proposals panel + wire Send button in LeagueScreen

**Files:**
- Modify: `src/screens/LeagueScreen.jsx`

The trade builder UI already exists (lines ~1015–1105). This task:
1. Imports `useTradeProposals`
2. Replaces the `validateAndSendProposal` stub with real RPC call
3. Adds an incoming proposals panel below the trade builder (or as a separate section in the hub)

### Where to insert the incoming panel

The LeagueScreen renders a hub with tabs. The proposals panel should appear in the same view as the trade builder — specifically, inside the `showTradeBuilder` section, stacked above the builder form. This way it's visible to the target manager when they open the trades view.

- [ ] **Step 3.1 — Add import at top of LeagueScreen.jsx**

Find the block of hook imports near the top of `src/screens/LeagueScreen.jsx`. Add after the last hook import:

```js
import { useTradeProposals } from '../hooks/useTradeProposals';
```

> **TDZ check**: `useTradeProposals` is a new leaf-module hook — it doesn't import anything from `LeagueScreen`'s existing imports, so no Rolldown TDZ risk. Safe to add.

- [ ] **Step 3.2 — Mount the hook**

Find the existing state declarations near:
```js
const [tradeMyPlayer, setTradeMyPlayer] = useState(null);
```

Add the hook call directly after the existing trade state declarations (around line 118):

```js
  const {
    incoming: incomingTrades,
    outgoing: outgoingTrades,
    submitProposal,
    acceptProposal,
    rejectProposal,
    cancelProposal,
  } = useTradeProposals(activeLeague?.league_id, mySquadId);
```

- [ ] **Step 3.3 — Replace `validateAndSendProposal` stub**

Find:
```js
  const validateAndSendProposal = () => {
    // U8: Trade proposals backend not yet wired — show "coming soon" instead of a phantom toast.
    showToast('Trade proposals coming soon — this feature is in development.', 'info');
  };
```

Replace with:

```js
  const validateAndSendProposal = async () => {
    if (!tradeMyPlayer || !tradeTheirPlayer || !tradeTarget) {
      setTradeError('Select a player from each squad to propose a trade.');
      return;
    }
    setTradeError(null);
    try {
      await submitProposal({
        targetSquadId:  tradeTarget.squadId,
        myPlayerId:     tradeMyPlayer.id,
        theirPlayerId:  tradeTheirPlayer.id,
        cashSweetener:  tradeCash,
        pointsSweetener: tradePoints,
      });
      showToast('Trade proposal sent!', 'success');
      setShowTradeBuilder(false);
      setTradeTarget(null);
      setTradeMyPlayer(null);
      setTradeTheirPlayer(null);
      setTradeCash(5.0);
      setTradePoints(0);
    } catch (err) {
      const msg = {
        INSUFFICIENT_BUDGET: 'Not enough budget to offer that cash sweetener.',
        INSUFFICIENT_POINTS: 'Not enough points to offer as sweetener.',
        PROPOSER_PLAYER_NOT_IN_SQUAD: 'That player is no longer in your squad.',
        TARGET_PLAYER_NOT_IN_SQUAD: 'That player is no longer in the target squad.',
      }[err.message] || err.message;
      setTradeError(msg);
    }
  };
```

> **Note on `tradeTarget.squadId`**: The trade builder opens when a manager row is clicked and `setTradeTarget` is called. Check what object shape `tradeTarget` currently holds. Search for `setTradeTarget(` to see what properties are set. If it doesn't yet include `squadId`, add it in Step 3.4.

- [ ] **Step 3.4 — Ensure `tradeTarget` includes `squadId`**

Search for `setTradeTarget(` in `LeagueScreen.jsx`. You will find it called when a manager's row is tapped in the standings view. The object currently contains something like `{ name, username }`. Extend it to also pass `squadId`:

Find the click handler that opens the trade builder. It will look like:
```js
setTradeTarget({ name: member.username, ... });
```

Change it to include the squad id. To get the squad ID from a league member, the `mySquadId` query pattern already works — you'll need a lookup. The simplest approach: when building the members list in the league fetch, include the squad id.

Search for where `membersData` or `leagueMembers` is mapped to find member objects. Add a `squadId` field by joining through `squads`:

In the league loading section (around the `loadLeagueById` or standings fetch), extend the member query to also fetch squads:

```js
// When fetching members for standings, also fetch their squad id
const { data: squadsData } = await supabase
  .from('squads')
  .select('id, user_id')
  .eq('league_id', leagueId)
  .order('created_at', { ascending: false });

const squadByUser = {};
(squadsData || []).forEach(s => { squadByUser[s.user_id] = s.id; });
```

Then when building member objects:
```js
// When mapping members to the standings list, add squadId
members.map(m => ({ ...m, squadId: squadByUser[m.user_id] }))
```

Then in `setTradeTarget`:
```js
setTradeTarget({ name: member.username, squadId: member.squadId, ... });
```

- [ ] **Step 3.5 — Add incoming proposals panel in the trade builder section**

Find the opening of the trade builder modal/section in JSX (around line 1015):
```jsx
{showTradeBuilder && tradeTarget && (
```

Just above or inside that block, add the incoming proposals panel. Insert this before the trade builder form `<div>`:

```jsx
{/* Incoming trade proposals */}
{incomingTrades.length > 0 && (
  <div style={{ marginBottom: 24 }}>
    <h3 style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>
      INCOMING OFFERS ({incomingTrades.length})
    </h3>
    {incomingTrades.map(p => (
      <div key={p.id} style={{
        background: 'var(--ink-2)', border: '1px solid var(--rule)',
        borderRadius: 4, padding: '12px 16px', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--paper)', fontSize: 12, fontWeight: 700 }}>
            {p.proposer_player?.name} <span style={{ color: 'var(--mute)' }}>for</span> {p.target_player?.name}
          </span>
          <span style={{ color: 'var(--mute)', fontSize: 10 }}>
            {new Date(p.created_at).toLocaleDateString()}
          </span>
        </div>
        {(p.cash_sweetener !== 0 || p.points_sweetener > 0) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {p.cash_sweetener !== 0 && (
              <span style={{ color: p.cash_sweetener > 0 ? 'var(--positive)' : 'var(--danger)', fontSize: 11, fontWeight: 700 }}>
                {p.cash_sweetener > 0 ? `+€${p.cash_sweetener}M (you receive)` : `-€${Math.abs(p.cash_sweetener)}M (you pay)`}
              </span>
            )}
            {p.points_sweetener > 0 && (
              <span style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 700 }}>
                +{p.points_sweetener} pts sweetener
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={async () => {
              try {
                await acceptProposal(p.id);
                showToast('Trade accepted! Squads updated.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }}
            style={{
              background: 'var(--positive)', color: '#000', fontSize: 11,
              fontWeight: 900, padding: '6px 14px', borderRadius: 2, border: 'none', cursor: 'pointer',
            }}
          >
            ACCEPT
          </button>
          <button
            onClick={async () => {
              try {
                await rejectProposal(p.id);
                showToast('Trade rejected.', 'info');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }}
            style={{
              background: 'var(--ink-3)', color: 'var(--mute)', fontSize: 11,
              fontWeight: 900, padding: '6px 14px', borderRadius: 2, border: 'none', cursor: 'pointer',
            }}
          >
            DECLINE
          </button>
        </div>
      </div>
    ))}
  </div>
)}

{/* Outgoing proposals I've sent */}
{outgoingTrades.length > 0 && (
  <div style={{ marginBottom: 24 }}>
    <h3 style={{ color: 'var(--mute)', fontSize: 12, fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>
      SENT OFFERS ({outgoingTrades.length})
    </h3>
    {outgoingTrades.map(p => (
      <div key={p.id} style={{
        background: 'var(--ink-2)', border: '1px solid var(--rule)',
        borderRadius: 4, padding: '12px 16px', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--paper)', fontSize: 12, fontWeight: 700 }}>
            {p.proposer_player?.name} <span style={{ color: 'var(--mute)' }}>for</span> {p.target_player?.name}
          </span>
          <span style={{ color: 'var(--mute)', fontSize: 10 }}>awaiting response</span>
        </div>
        <button
          onClick={async () => {
            try {
              await cancelProposal(p.id);
              showToast('Offer cancelled.', 'info');
            } catch (err) {
              showToast(err.message, 'error');
            }
          }}
          style={{
            background: 'transparent', color: 'var(--danger)', fontSize: 10,
            fontWeight: 700, padding: '4px 10px', borderRadius: 2,
            border: '1px solid var(--danger)', cursor: 'pointer',
          }}
        >
          CANCEL OFFER
        </button>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3.6 — Run lint + build**

```bash
npx eslint src/screens/LeagueScreen.jsx
npm run build
```

Expected: 0 lint errors, build succeeds. If there is a TDZ-related build error, check that `useTradeProposals` is only imported in one place (LeagueScreen, not also in a child component).

- [ ] **Step 3.7 — Commit**

```bash
git add src/screens/LeagueScreen.jsx
git commit -m "feat: wire trade proposal UI — real RPC, incoming/outgoing panels, accept/reject/cancel"
```

---

## Task 4 — Push notification badge for incoming trades

The existing notification bell in LeagueScreen already shows unread counts for bets. Extend it to count pending incoming trades too.

**Files:**
- Modify: `src/screens/LeagueScreen.jsx` (minor addition)

- [ ] **Step 4.1 — Add trade count to the notification badge**

Find where the unread notification badge count is rendered (search for `unreadCount` or the notification bell icon). It currently shows the count from `useNotifications`. Add `incomingTrades.length` to it:

Find:
```jsx
{unreadCount > 0 && <span ...>{unreadCount}</span>}
```

Change to:
```jsx
{(unreadCount + incomingTrades.length) > 0 && (
  <span ...>{unreadCount + incomingTrades.length}</span>
)}
```

If the badge is a separate component, pass `extraCount={incomingTrades.length}` as a prop and add it inside that component.

- [ ] **Step 4.2 — Final build + lint check**

```bash
npx eslint src/screens/LeagueScreen.jsx src/hooks/useTradeProposals.js
npm run build
```

Expected: 0 errors, build clean.

- [ ] **Step 4.3 — Commit**

```bash
git add src/screens/LeagueScreen.jsx
git commit -m "feat: include incoming trade count in notification badge"
```

---

## Task 5 — Create PR and merge

- [ ] **Step 5.1 — Pull latest main and rebase if needed**

```bash
git fetch origin
git rebase origin/main
```

- [ ] **Step 5.2 — Push branch**

```bash
git push origin HEAD
```

- [ ] **Step 5.3 — Create PR**

```bash
gh pr create \
  --title "feat: trade proposals — bilateral player swaps with cash/points sweeteners" \
  --body "$(cat <<'EOF'
## Summary
- Migration 85: \`trade_proposals\` table + RLS + 4 SECURITY DEFINER RPCs (submit/accept/reject/cancel)
- \`useTradeProposals\` hook: fetch + Realtime subscribe + action methods
- LeagueScreen: wired \`validateAndSendProposal\` to real RPC; incoming/outgoing proposals panels with Accept / Decline / Cancel actions
- Notification badge updated to include pending incoming trade count
- Existing \`league_notifications\` reused for trade_proposal and trade_accepted alerts

## Test plan
- [ ] Submit a trade proposal as manager A → manager B receives notification bell increment
- [ ] Manager B opens trade builder → sees INCOMING OFFERS panel with correct players and sweeteners
- [ ] Accept → both squads update, budget adjusts, proposal disappears from panel
- [ ] Reject → proposal disappears cleanly
- [ ] Cancel from outgoing panel → proposal removed
- [ ] Lint passes, build passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5.4 — Merge and clean up**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Player ownership investigation → done (squads.players TEXT[])
- [x] Migration 85 with table + RLS + 4 RPCs → Task 1
- [x] `useTradeProposals` hook → Task 2
- [x] Incoming proposals panel → Task 3
- [x] `validateAndSendProposal` wired to RPC → Task 3 Step 3.3
- [x] Notification reuse → RPC inserts into `league_notifications`, badge updated in Task 4

**Potential gaps:**
- `tradeTarget.squadId` might not exist today — Task 3 Step 3.4 addresses this explicitly
- Foreign key aliases in PostgREST (e.g. `players!trade_proposals_proposer_player_id_fkey`) — if the FK name differs, the join alias must match. Verify after migration is applied: `npx supabase db query --linked "SELECT conname FROM pg_constraint WHERE conrelid = 'trade_proposals'::regclass AND contype = 'f';"` and adjust the select query in `useTradeProposals.js` to match actual FK constraint names.

**Type consistency check:**
- `submitProposal({ targetSquadId, myPlayerId, theirPlayerId, cashSweetener, pointsSweetener })` — used in Task 3 Step 3.3, defined in Task 2. ✓
- `acceptProposal(proposalId)` / `rejectProposal(proposalId)` / `cancelProposal(proposalId)` — shape consistent between Task 2 and Task 3. ✓
- `incomingTrades` / `outgoingTrades` — array of proposal objects with `.proposer_player`, `.target_player` nested objects. JSX in Task 3 Step 3.5 uses these fields. ✓
