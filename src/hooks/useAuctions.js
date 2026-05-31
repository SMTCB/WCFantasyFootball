import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useAuctions(leagueId, squadId) {
  const [auctions, setAuctions]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    if (!leagueId) return;
    cancelRef.current = false;
    setLoading(true);
    const { data } = await supabase
      .from('auction_listings')
      .select(`
        id, player_id, seller_id, starting_bid, current_bid, highest_bidder_id, deadline_at, status, created_at, min_increment,
        players(id, name, position, club, price)
      `)
      .eq('league_id', leagueId)
      .eq('status', 'open')
      .order('deadline_at', { ascending: true });
    if (!cancelRef.current) { setAuctions(data ?? []); setLoading(false); }
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

  return { auctions, loading, listPlayer, placeBid, cancelListing, sellNow, reload: load };
}
