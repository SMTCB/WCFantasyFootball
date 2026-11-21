// Pending transfers for one league, shared by the My team tab and the market sheet (S31, MD-12).
// Nothing reaches the server until the manager presses "Confirm transfers"; until then the
// sells and buys live here, so they survive closing the market sheet or switching tabs.
// Items are { type: 'sell' | 'buy', player }.
import { useCallback, useEffect, useSyncExternalStore } from 'react';

const baskets = new Map();   // leagueId -> item[]
const listeners = new Set();
const EMPTY = [];

function emit() { listeners.forEach(l => l()); }
function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }

export function getBasket(leagueId) {
  return baskets.get(leagueId) ?? EMPTY;
}

export function setBasketFor(leagueId, next) {
  const value = typeof next === 'function' ? next(getBasket(leagueId)) : next;
  if (value === getBasket(leagueId)) return;
  if (!value || value.length === 0) baskets.delete(leagueId);
  else baskets.set(leagueId, value);
  emit();
}

export function useTransferBasket(leagueId) {
  const basket = useSyncExternalStore(subscribe, () => getBasket(leagueId));
  const setBasket = useCallback(next => setBasketFor(leagueId, next), [leagueId]);

  // Leaving the page with unsent changes would lose them; let the browser ask first.
  useEffect(() => {
    if (basket.length === 0) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [basket.length]);

  return [basket, setBasket];
}

// Sells first (they free money and slots), then buys, one at a time. Stops at the first
// failure so the manager sees exactly which change did not go through; everything after it
// stays pending. Returns { done: item[], failed: { item, error } | null, budget }.
export async function runBasket(basket, { buy, sell }) {
  const ordered = [...basket.filter(i => i.type === 'sell'), ...basket.filter(i => i.type === 'buy')];
  const done = [];
  let budget = null;
  for (const item of ordered) {
    const res = item.type === 'sell' ? await sell(item.player) : await buy(item.player);
    if (!res?.ok) return { done, failed: { item, error: res?.error || 'Transfer failed' }, budget };
    if (res.budget_remaining != null) budget = res.budget_remaining;
    done.push(item);
  }
  return { done, failed: null, budget };
}

// Pairs each pending sell with a buy in the same position, so the pitch can show the
// incoming player where the outgoing one stood. Unpaired items are returned on their own.
export function pairBasket(basket) {
  const buys = basket.filter(i => i.type === 'buy');
  const used = new Set();
  const pairs = [];
  for (const s of basket.filter(i => i.type === 'sell')) {
    const b = buys.find(x => !used.has(x.player.id) && x.player.position === s.player.position);
    if (b) used.add(b.player.id);
    pairs.push({ out: s.player, in: b?.player ?? null });
  }
  for (const b of buys) if (!used.has(b.player.id)) pairs.push({ out: null, in: b.player });
  return pairs;
}
