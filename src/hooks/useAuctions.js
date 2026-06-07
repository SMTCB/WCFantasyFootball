import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useAuctions(leagueId, squadId) {
  const [auctions,       setAuctions]       = useState([]);
  const [pendingAuctions,setPendingAuctions]= useState([]);
  const [closedAuctions, setClosedAuctions] = useState([]);
  const [loading, setLoading]               = useState(false);
  const cancelRef = useRef(false);

  const FIELDS        = `id, player_id, seller_id, starting_bid, current_bid, highest_bidder_id, deadline_at, status, created_at, min_increment, won_at, players(id, name, position, club, price)`;
  const FIELDS_CLOSED = `id, player_id, seller_id, starting_bid, current_bid, highest_bidder_id, deadline_at, status, created_at, won_at, players(id, name, position, club)`;

  const load = useCallback(async () => {
    if (!leagueId) return;
    cancelRef.current = false;
    setLoading(true);
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const [{ data: open }, { data: pending }, { data: closed }] = await Promise.all([
      supabase.from('auction_listings').select(FIELDS)
        .eq('league_id', leagueId).eq('status', 'open')
        .order('deadline_at', { ascending: true }),
      supabase.from('auction_listings').select(FIELDS)
        .eq('league_id', leagueId).eq('status', 'pending_confirmation')
        .order('won_at', { ascending: false }),
      supabase.from('auction_listings').select(FIELDS_CLOSED)
        .eq('league_id', leagueId).in('status', ['sold', 'cancelled'])
        .gte('created_at', cutoff)
        .order('updated_at', { ascending: false }).limit(20),
    ]);
    if (cancelRef.current) return;

    // Enrich with bidder username — batch fetch once for all unique bidder IDs
    const allListings = [...(open ?? []), ...(pending ?? []), ...(closed ?? [])];
    const bidderIds = [...new Set(allListings.map(l => l.highest_bidder_id).filter(Boolean))];
    let usernameMap = {};
    if (bidderIds.length > 0) {
      const { data: profiles } = await supabase
        .from('users')
        .select('id, username')
        .in('id', bidderIds);
      usernameMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.username]));
    }
    const enrich = rows => (rows ?? []).map(r => ({
      ...r,
      bidder_name: r.highest_bidder_id ? (usernameMap[r.highest_bidder_id] ?? null) : null,
    }));

    if (!cancelRef.current) {
      setAuctions(enrich(open));
      setPendingAuctions(enrich(pending));
      setClosedAuctions(enrich(closed));
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  useEffect(() => {
    load();
    return () => { cancelRef.current = true; };
  }, [load]);

  const listPlayer = useCallback(async (playerId, minBid, hoursOpen = 48) => {
    if (!leagueId || !squadId) return { ok: false, error: 'No league or squad selected.' };
    const deadline_at = new Date(Date.now() + hoursOpen * 3600_000).toISOString();
    const { error } = await supabase.from('auction_listings').insert({
      league_id: leagueId, seller_id: squadId, player_id: playerId,
      starting_bid: minBid, current_bid: minBid, deadline_at, status: 'open',
    });
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }, [leagueId, squadId, load]);

  const placeBid = useCallback(async (auctionId, amount) => {
    if (!squadId) return { ok: false, error: 'No squad selected.' };
    const { data, error } = await supabase.rpc('place_bid', {
      p_listing_id: auctionId,
      p_bid_amount: amount,
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'Bid failed.' };
    await load();
    return { ok: true };
  }, [squadId, load]);

  const cancelListing = useCallback(async (auctionId) => {
    // Only allow cancel when no bids have been placed — prevents rug-pulling bidders
    const { error } = await supabase
      .from('auction_listings')
      .update({ status: 'cancelled' })
      .eq('id', auctionId)
      .eq('seller_id', squadId)
      .is('highest_bidder_id', null);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }, [squadId, load]);

  const sellNow = useCallback(async (auctionId) => {
    const { data, error } = await supabase.rpc('sell_now', { p_listing_id: auctionId });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'Sell failed.' };
    await load();
    return { ok: true };
  }, [load]);

  const confirmWin = useCallback(async (listingId) => {
    const { data, error } = await supabase.rpc('confirm_auction_win', { p_listing_id: listingId });
    if (error) return { ok: false, code: 'RPC_ERROR', error: error.message };
    if (!data?.ok) return { ok: false, code: data?.code ?? 'UNKNOWN', error: data?.error ?? 'Confirmation failed.' };
    await load();
    return { ok: true };
  }, [load]);

  return { auctions, pendingAuctions, closedAuctions, loading, listPlayer, placeBid, cancelListing, sellNow, confirmWin, reload: load };
}
