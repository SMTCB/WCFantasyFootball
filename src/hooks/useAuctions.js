import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useAuctions(leagueId, squadId) {
  const [auctions, setAuctions]   = useState([]);
  const [loading, setLoading]     = useState(false);

  const load = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    const { data } = await supabase
      .from('auction_listings')
      .select(`
        id, player_id, seller_squad_id, min_bid, current_bid, bidder_squad_id, ends_at, status, created_at,
        players(id, name, position, club, price),
        seller:squads!seller_squad_id(id, user_id)
      `)
      .eq('league_id', leagueId)
      .eq('status', 'active')
      .order('ends_at', { ascending: true });
    setAuctions(data ?? []);
    setLoading(false);
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  const listPlayer = useCallback(async (playerId, minBid, hoursOpen = 48) => {
    if (!leagueId || !squadId) return { ok: false, error: 'No league or squad selected.' };
    const ends_at = new Date(Date.now() + hoursOpen * 3600_000).toISOString();
    const { error } = await supabase.from('auction_listings').insert({
      league_id: leagueId, seller_squad_id: squadId, player_id: playerId,
      min_bid: minBid, ends_at,
    });
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }, [leagueId, squadId, load]);

  const placeBid = useCallback(async (auctionId, amount) => {
    if (!squadId) return { ok: false, error: 'No squad selected.' };
    const { data, error } = await supabase.rpc('place_bid', {
      p_auction_id:   auctionId,
      p_bidder_squad: squadId,
      p_amount:       amount,
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'Bid failed.' };
    await load();
    return { ok: true };
  }, [squadId, load]);

  const cancelListing = useCallback(async (auctionId) => {
    const { error } = await supabase
      .from('auction_listings')
      .update({ status: 'cancelled' })
      .eq('id', auctionId)
      .eq('seller_squad_id', squadId);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }, [squadId, load]);

  return { auctions, loading, listPlayer, placeBid, cancelListing, reload: load };
}
