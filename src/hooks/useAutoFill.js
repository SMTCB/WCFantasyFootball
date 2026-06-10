import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Populates the transfer basket with suggested players — no DB writes happen here.
 * The user reviews the basket and confirms (or removes unwanted picks) as normal.
 *
 * @param {string}   leagueId     - Active league UUID
 * @param {object}   squadData    - Squad object (from MarketScreen)
 * @param {function} fetchSquad   - Callback to refresh squad (unused during fill; kept for API compat)
 * @param {object}   takenMap     - { [playerId]: { userId, managerName } } from useTransfer
 * @param {function} addToBasket  - (player) => void  — adds a buy item to the basket
 * @param {object}   cfg          - League config from useLeagueConfig
 * @param {Array}    basket       - Current basket items [{type, player}] — pending sells/buys applied before fill
 */
export function useAutoFill(leagueId, squadData, fetchSquad, takenMap = {}, addToBasket, cfg = {}, basket = []) {
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState(null);
  const clearMsgTimerRef = useRef(null);
  const fillingRef       = useRef(false);

  useEffect(() => () => { if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current); }, []);

  const POS_LIMITS = cfg.positionLimits;

  const handleAutoFill = useCallback(async () => {
    if (fillingRef.current) return;
    fillingRef.current = true;
    setAutoFilling(true);
    setAutoFillMsg(null);

    try {
      if (!leagueId) {
        setAutoFillMsg('No league selected — open your squad from the League screen');
        return;
      }

      // ── Compute effective squad state from basket + DB ───────────────────
      // Pending sells free slots; pending buys occupy slots.
      const pendingSells   = (basket ?? []).filter(b => b.type === 'sell');
      const pendingBuys    = (basket ?? []).filter(b => b.type === 'buy');
      const pendingSellIds = new Set(pendingSells.map(b => b.player?.id ?? b.player));
      const pendingBuyIds  = new Set(pendingBuys.map(b => b.player?.id ?? b.player));
      const pendingSellBudget = pendingSells.reduce((s, b) => s + (Number(b.player?.price) || 0), 0);

      // Fetch current user + fresh squad from DB
      let freshUser      = null;
      let freshPlayerIds = null;
      let freshBudget    = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        freshUser = user;
        if (user?.id) {
          const { data: freshSquad } = await supabase
            .from('squads')
            .select('players, budget_remaining')
            .eq('league_id', leagueId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (freshSquad) {
            freshPlayerIds = freshSquad.players;
            freshBudget    = Number(freshSquad.budget_remaining);
          }
        }
      } catch { /* network hiccup — fall through to squadData */ }

      const rawPlayers  = freshPlayerIds ?? squadData?.players ?? [];
      const squadSize   = cfg.squadSize ?? 15;

      // Apply basket: remove pending sells, add pending buys
      const effectivePlayers = rawPlayers
        .filter(id => !pendingSellIds.has(typeof id === 'object' ? id?.id : id))
        .concat(pendingBuys.map(b => b.player?.id ?? b.player));

      const slotsNeeded = squadSize - effectivePlayers.length;
      if (slotsNeeded <= 0) {
        setAutoFillMsg('Squad is already full');
        return;
      }

      // Budget = DB value + sell proceeds − pending buy costs (already in basket)
      const pendingBuyCost = pendingBuys.reduce((s, b) => s + (Number(b.player?.price) || 0), 0);
      let budgetLeft = (
        freshBudget                 ??
        squadData?.budget?.current  ??
        squadData?.budget_remaining ??
        cfg.budgetTotal             ??
        100
      ) + pendingSellBudget - pendingBuyCost;

      // ── Resolve player objects (need position + club for cap checks) ─────
      const knownIds = effectivePlayers.filter(id => typeof id === 'string');
      let playerObjects = [];
      if (knownIds.length > 0) {
        const { data: fetched } = await supabase
          .from('players')
          .select('id, position, club')
          .in('id', knownIds);
        playerObjects = fetched || [];
      }
      // Also include pending-buy objects directly (already have position/club)
      const pendingBuyObjects = pendingBuys.map(b => b.player).filter(Boolean);
      const allEffectiveObjects = [...playerObjects, ...pendingBuyObjects];

      // IDs the manager already owns or has queued — never re-add
      const myIds = new Set([
        ...playerObjects.map(p => p.id ?? p),
        ...pendingBuyIds,
      ]);

      // B2: noduplicate leagues exclude players taken by others
      const currentUserId = freshUser?.id;
      const isDraftLeague = (cfg.format ?? '') === 'noduplicate';
      const othersIds = isDraftLeague
        ? new Set(
            Object.entries(takenMap || {})
              .filter(([, v]) => v?.userId !== undefined && v?.userId !== currentUserId)
              .map(([id]) => id)
          )
        : new Set();

      // ── Fetch tournament_id ──────────────────────────────────────────────
      let tournamentId = null;
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('tournament_id')
        .eq('id', leagueId)
        .maybeSingle();
      tournamentId = leagueRow?.tournament_id ?? null;

      // ── Position counts (effective state) ───────────────────────────────
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const p of allEffectiveObjects) {
        if (typeof p !== 'object' || !p) continue;
        const rawPos = p.position?.toUpperCase() ?? '';
        const pos = rawPos === 'FW' ? 'FWD' : rawPos;
        if (pos && have[pos] !== undefined) have[pos]++;
      }

      // ── Per-club counts ──────────────────────────────────────────────────
      const FILL_CLUB_LIMIT = 3;
      const clubCounts = {};
      for (const p of allEffectiveObjects) {
        if (typeof p === 'object' && p?.club) clubCounts[p.club] = (clubCounts[p.club] ?? 0) + 1;
      }

      const minPer = cfg.minFormation ?? { GK: 1, DEF: 3, MID: 2, FWD: 1 };
      const maxPer = POS_LIMITS      ?? { GK: 2, DEF: 5, MID: 5, FWD: 3 };

      // ── Slots needed per position ────────────────────────────────────────
      const need = {};
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        need[pos] = Math.max(0, (minPer[pos] ?? 0) - have[pos]);
      }
      let minTotal = Object.values(need).reduce((s, n) => s + n, 0);
      if (minTotal > slotsNeeded) {
        let excess = minTotal - slotsNeeded;
        for (const pos of ['FWD', 'MID', 'DEF', 'GK']) {
          if (excess <= 0) break;
          const trim = Math.min(excess, need[pos]);
          need[pos] -= trim;
          excess    -= trim;
        }
      }
      let extra = slotsNeeded - Object.values(need).reduce((s, n) => s + n, 0);
      for (const pos of ['DEF', 'MID', 'FWD', 'GK']) {
        if (extra <= 0) break;
        const capacity = Math.max(0, (maxPer[pos] ?? 5) - have[pos] - need[pos]);
        const give     = Math.min(extra, capacity);
        need[pos] += give;
        extra     -= give;
      }

      // ── Fill each position ───────────────────────────────────────────────
      let added        = 0;
      let anyPoolFound = false;
      const POS_ORDER  = ['GK', 'DEF', 'MID', 'FWD'];

      for (const pos of POS_ORDER) {
        if (!need[pos]) continue;
        if (budgetLeft < 3.5) break; // no affordable player possible

        const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];

        let query = supabase
          .from('players')
          .select('id, name, position, club, price')
          .eq('is_active', true)
          .in('position', dbPos)
          .lte('price', budgetLeft)
          .order('price', { ascending: true })
          .limit(500);

        if (tournamentId) query = query.eq('tournament_id', tournamentId);

        const { data: pool } = await query;
        if (!pool?.length) continue;

        const candidates = pool.filter(p =>
          !myIds.has(p.id) &&
          !othersIds.has(p.id) &&
          (clubCounts[p.club] ?? 0) < FILL_CLUB_LIMIT
        );
        if (candidates.length > 0) anyPoolFound = true;

        // Shuffle so repeated fills give variety
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        let bought = 0;

        for (const candidate of shuffled) {
          if (bought >= need[pos]) break;
          if (candidate.price > budgetLeft) continue;

          // Add to basket — no DB write
          addToBasket(candidate);
          bought++;
          added++;
          budgetLeft -= candidate.price;
          myIds.add(candidate.id);
          have[pos]++;
          if (candidate.club) clubCounts[candidate.club] = (clubCounts[candidate.club] ?? 0) + 1;
        }
      }

      if (added > 0) {
        setAutoFillMsg(`Added ${added} player${added !== 1 ? 's' : ''} to basket — review and confirm`);
      } else if (!anyPoolFound) {
        if (budgetLeft < 4.5) {
          setAutoFillMsg('Budget too low — sell a player to free up funds');
        } else {
          setAutoFillMsg('No players available for these positions within your budget');
        }
      } else {
        setAutoFillMsg('Could not find enough candidates — try adjusting filters or refreshing');
      }

    } catch (err) {
      console.error('[useAutoFill]', err);
      setAutoFillMsg('Auto-fill failed — try again');
    } finally {
      fillingRef.current = false;
      setAutoFilling(false);
      if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current);
      clearMsgTimerRef.current = setTimeout(() => setAutoFillMsg(null), 7000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, addToBasket, takenMap, cfg, basket]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
