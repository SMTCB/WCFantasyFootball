import { useMemo } from 'react';

// Merges the two P2P schemas — 1:1 p2p_challenges and group p2p_bets — into one
// kind-tagged view for the unified Bets tab. Pure client-side merge of data already
// fetched by useChallenges/useGroupBets: no new RPC, no change to either hook's
// mutators. Card components dispatch on `kind` ('challenge' | 'bet') to call the
// right mutator for that row.
export function useAllBets(challengesData, groupBetsData, { isOwner, userId } = {}) {
  const {
    incoming: cIncoming = [], outgoing: cOutgoing = [], active: cActive = [],
    disputed: cDisputed = [], history: cHistory = [], openChallenges: cOpen = [],
    loading: challengesLoading = false,
  } = challengesData ?? {};
  const {
    openInvited = [], myOpenJoined = [], closedAwaitingDeclare = [], closedAwaitingResolution = [],
    disputed: bDisputed = [], history: bHistory = [], loading: betsLoading = false,
  } = groupBetsData ?? {};

  const myDisputed = useMemo(
    () => cDisputed.filter(c => c.challenger_id === userId || c.opponent_id === userId),
    [cDisputed, userId],
  );
  const ownerDisputed = useMemo(
    () => (isOwner ? cDisputed.filter(c => c.challenger_id !== userId && c.opponent_id !== userId) : []),
    [cDisputed, isOwner, userId],
  );

  const incoming = useMemo(() => [
    ...cIncoming.map(c => ({ kind: 'challenge', ...c })),
    ...cOpen.map(c => ({ kind: 'open_challenge', ...c })),
    ...openInvited.map(b => ({ kind: 'bet', ...b })),
  ], [cIncoming, cOpen, openInvited]);

  const sent = useMemo(
    () => cOutgoing.map(c => ({ kind: 'challenge', ...c })),
    [cOutgoing],
  );

  const live = useMemo(() => [
    ...cActive.map(c => ({ kind: 'challenge', ...c })),
    ...myDisputed.map(c => ({ kind: 'challenge', ...c })),
    ...myOpenJoined.map(b => ({ kind: 'bet', ...b })),
  ], [cActive, myDisputed, myOpenJoined]);

  const awaitingOutcome = useMemo(() => [
    ...closedAwaitingDeclare.map(b => ({ kind: 'bet', ...b })),
    ...closedAwaitingResolution.map(b => ({ kind: 'bet', ...b })),
  ], [closedAwaitingDeclare, closedAwaitingResolution]);

  const disputedBets = useMemo(
    () => bDisputed.map(b => ({ kind: 'bet', ...b })),
    [bDisputed],
  );

  const ownerArbitration = useMemo(
    () => ownerDisputed.map(c => ({ kind: 'challenge', ...c })),
    [ownerDisputed],
  );

  const history = useMemo(() => [
    ...cHistory.map(c => ({ kind: 'challenge', ...c })),
    ...bHistory.map(b => ({ kind: 'bet', ...b })),
  ], [cHistory, bHistory]);

  return {
    incoming, sent, live, awaitingOutcome, disputedBets, ownerArbitration, history,
    loading: challengesLoading || betsLoading,
  };
}
