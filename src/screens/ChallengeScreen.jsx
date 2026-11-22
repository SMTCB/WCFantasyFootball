import { LoadingRows } from '../components/Skeleton';
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useChallenges } from '../hooks/useChallenges';
import { useGroupBets } from '../hooks/useGroupBets';
import { useAllBets } from '../hooks/useAllBets';
import { useP2PStreak } from '../hooks/useP2PStreak';
import { useWallet } from '../hooks/useWallet';
import { useIsMobile } from '../hooks/useViewport';
import { useClubhouseContext } from '../context/ClubhouseContext';
import PrimaryActionBar from '../components/shared/PrimaryActionBar';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import {
  HEAD,
  Icon,
  Ci,
  CoinAmt,
  IncomingCard,
  OpenChallengeCard,
  OutgoingCard,
  LiveCard,
  DeclareResultModal,
  ArbitrationModal,
  friendlyBetError,
  CreateGroupBetModal,
  SubmitAnswerModal,
  DeclareOutcomeModal,
  ArbitrateOutcomeModal,
  BetCard,
  BetSection,
  HistoryItem,
  WalletTabContent,
  CreateChallengeModal,
  NewBetModal,
  SidebarContent,
} from '../components/bets/BetKit';

export default function ChallengeScreen() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { wallet, loading: walletLoading } = useWallet(user?.id);
  const { streak } = useP2PStreak(user?.id);
  const { activeCircleId, activeCircle, members, competitions } = useClubhouseContext();
  const {
    incoming, outgoing, active, disputed, history, openChallenges, loading,
    createChallenge, acceptChallenge, declineChallenge, cancelChallenge, claimChallenge,
    declareResult, confirmResult, disputeResult, arbitrateResult,
  } = useChallenges(user?.id, activeCircleId);

  const betsEnabled = !!activeCircle?.p2p_betting_enabled;
  const {
    openInvited, myOpenJoined, closedAwaitingDeclare, closedAwaitingResolution,
    disputed: disputedBets, history: betHistory, loading: betsLoading,
    createBet, joinBet, declineBet, submitAnswer, closeBet, cancelBet,
    declareOutcome, disputeOutcome, arbitrateOutcome, fetchParticipants, fetchAnswers,
  } = useGroupBets(user?.id, activeCircleId);

  const [searchParams] = useSearchParams();
  const [outerTab, setOuterTab] = useState(() => {
    const t = searchParams.get('tab');
    return t === 'wallet' ? t : 'bets';
  });
  const [showCreate, setShowCreate] = useState(() => searchParams.get('new') === '1');
  const [actionLoading, setAction]  = useState(false);
  const [toast, setToast]           = useState(null);
  const [declaringChallenge, setDeclaringChallenge]     = useState(null);
  const [arbitratingChallenge, setArbitratingChallenge] = useState(null);

  const [betActionLoading, setBetActionLoading]   = useState(false);
  const [answeringBet, setAnsweringBet]           = useState(null);
  const [declaringBet, setDeclaringBet]           = useState(null);
  const [arbitratingBet, setArbitratingBet]       = useState(null);
  const [cancellingBet, setCancellingBet]         = useState(null);
  const [disputingBet, setDisputingBet]           = useState(null);

  // ?opponent=<id> (People tab "Challenge"): open a head-to-head challenge pre-aimed at that member.
  const [rematchChallengeSeed, setRematchChallengeSeed] = useState(() => {
    const opp = searchParams.get('opponent');
    return opp ? { opponentId: opp, betType: 'freeform' } : null;
  });
  const [rematchBetSeed, setRematchBetSeed]             = useState(null);
  const [rematchBusy, setRematchBusy]                   = useState(false);

  const isOwner = activeCircle?.role === 'owner';

  const allBets = useAllBets(
    { incoming, outgoing, active, disputed, history, openChallenges, loading },
    betsEnabled
      ? { openInvited, myOpenJoined, closedAwaitingDeclare, closedAwaitingResolution, disputed: disputedBets, history: betHistory, loading: betsLoading }
      : undefined,
    { isOwner, userId: user?.id },
  );

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleAccept(id) {
    setAction(true);
    try { await acceptChallenge(id); showToast('Bet accepted — coins staked!'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleDecline(id) {
    setAction(true);
    try { await declineChallenge(id); showToast('Bet declined.'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleClaim(id) {
    setAction(true);
    try { await claimChallenge(id); showToast('Bet claimed — accept it to stake your coins!'); }
    catch (e) {
      const friendly = {
        ALREADY_CLAIMED:            'Someone already claimed this bet',
        CHALLENGE_NOT_PENDING:      'This bet is no longer open',
        CHALLENGE_EXPIRED:          'This bet has expired',
        CANNOT_CLAIM_OWN_CHALLENGE: "You can't claim your own bet",
        NOT_CIRCLE_MEMBER:          'You are not a member of this Clubhouse',
        NOT_LEAGUE_MEMBER:          'You are not a member of that league',
      }[e.message] ?? e.message;
      showToast(friendly, true);
    }
    setAction(false);
  }

  async function handleCancel(id) {
    setAction(true);
    try { await cancelChallenge(id); showToast('Bet cancelled — coins returned.'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleDeclareSubmit(winnerId) {
    await declareResult(declaringChallenge.id, winnerId);
    showToast('Result declared — waiting for confirmation.');
  }

  async function handleConfirm(id) {
    setAction(true);
    try { await confirmResult(id); showToast('Confirmed — coins settled!'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleDispute(id) {
    setAction(true);
    try { await disputeResult(id); showToast('Disputed — the Clubhouse owner has been notified.'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleArbitrateSubmit(winnerId) {
    await arbitrateResult(arbitratingChallenge.id, winnerId);
    showToast(winnerId ? 'Arbitrated — coins settled.' : 'Voided — both stakes returned.');
  }

  async function handleJoinBet(betId) {
    setBetActionLoading(true);
    try { await joinBet(betId); showToast('Joined — coins staked!'); }
    catch (e) { showToast(friendlyBetError(e.message), true); }
    setBetActionLoading(false);
  }

  async function handleDeclineBet(betId) {
    setBetActionLoading(true);
    try { await declineBet(betId); showToast('Declined.'); }
    catch (e) { showToast(friendlyBetError(e.message), true); }
    setBetActionLoading(false);
  }

  async function handleCloseBet(betId) {
    setBetActionLoading(true);
    try { await closeBet(betId); showToast('Betting closed — ready to declare an outcome.'); }
    catch (e) { showToast(friendlyBetError(e.message), true); }
    setBetActionLoading(false);
  }

  async function handleCancelBetConfirmed() {
    setBetActionLoading(true);
    try { await cancelBet(cancellingBet.id); showToast('Bet cancelled — coins returned.'); }
    catch (e) { showToast(friendlyBetError(e.message), true); }
    setBetActionLoading(false);
    setCancellingBet(null);
  }

  async function handleSubmitAnswer(betId, payload) {
    await submitAnswer(betId, payload);
    showToast('Answer submitted!');
  }

  async function handleDeclareBetSubmit(betId, payload) {
    await declareOutcome(betId, payload);
    showToast('Result declared — participants have 24 hours to object.');
  }

  async function handleDisputeBetConfirmed() {
    setBetActionLoading(true);
    try { await disputeOutcome(disputingBet.id); showToast('Disputed — the Clubhouse owner has been notified.'); }
    catch (e) { showToast(friendlyBetError(e.message), true); }
    setBetActionLoading(false);
    setDisputingBet(null);
  }

  async function handleArbitrateBetSubmit(betId, payload) {
    await arbitrateOutcome(betId, payload);
    showToast('Arbitrated — coins settled.');
  }

  function handleRematchChallenge(challenge) {
    const opponentId = challenge.challenger_id === user?.id ? challenge.opponent_id : challenge.challenger_id;
    setRematchChallengeSeed({
      betType: challenge.bet_type,
      opponentId,
      stakeCoins: challenge.stake_coins,
      question: challenge.bet_type === 'freeform' ? challenge.question : '',
    });
  }

  // Group bets don't carry their target list in the list RPCs — for `selected_users`
  // bets, fetch it on demand from the join table only when Rematch is tapped.
  async function handleRematchBet(bet) {
    if (bet.target_mode === 'selected_users') {
      setRematchBusy(true);
      try {
        const { data, error } = await supabase.from('p2p_bet_targets').select('user_id').eq('bet_id', bet.id);
        if (error) throw error;
        setRematchBetSeed({
          question: bet.question, answerMode: bet.answer_mode, stakeCoins: bet.stake_coins,
          targetMode: bet.target_mode, targetIds: (data ?? []).map(r => r.user_id),
        });
      } catch {
        showToast('Could not load bet details for rematch', true);
      }
      setRematchBusy(false);
      return;
    }
    setRematchBetSeed({
      question: bet.question, answerMode: bet.answer_mode, stakeCoins: bet.stake_coins,
      targetMode: bet.target_mode, targetIds: [],
    });
  }

  const balance  = wallet?.balance  ?? 0;
  const escrow   = wallet?.escrow   ?? 0;
  const netWL = history.reduce((sum, c) => {
    if (c.winner_id === user?.id) return sum + Math.floor(c.stake_coins * 2 * 0.95) - c.stake_coins;
    if (c.status === 'resolved' && c.winner_id !== user?.id && c.winner_id != null) return sum - c.stake_coins;
    return sum;
  }, 0);

  const tabs = [
    { key: 'bets',   label: 'Bets' },
    { key: 'wallet', label: 'Wallet' },
  ];

  // Mobile: page scrolls in document flow; Desktop: fixed-height flex column
  const rootStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: '100%' }
    : { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' };

  return (
    <div style={rootStyle}>

      {/* Toast */}
      {toast && createPortal(
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? 'var(--neg)' : 'var(--card)', color: 'var(--on-accent)',
          padding: '12px 22px', borderRadius: 'var(--radius)', fontSize: 'var(--fs-label)', zIndex: 999, whiteSpace: 'nowrap',
          boxShadow: '0 8px 28px rgba(0,0,0,.25)',
        }}>
          {toast.msg}
        </div>,
        document.body,
      )}

      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: isMobile ? '14px 16px 0' : '14px 26px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 12, gap: 16 }}>
          <div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 4 }}>Bets with friends</div>
            <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', letterSpacing: '-0.025em', color: 'var(--paper)', lineHeight: 1 }}>Bets</div>
          </div>
          {/* Key stats */}
          <div style={{ display: 'flex', gap: isMobile ? 14 : 22, alignItems: 'flex-start', paddingTop: 2 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 3 }}>Balance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                <Ci size="lg" />
                <span className="num" style={{ ...HEAD, fontSize: 'var(--fs-heading)', letterSpacing: '-0.02em', color: 'var(--gold-text)' }}>{balance.toLocaleString()}</span>
              </div>
            </div>
            {!isMobile && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 3 }}>On the table</div>
                <div className="num" style={{ ...HEAD, fontSize: 'var(--fs-heading)', letterSpacing: '-0.02em', color: 'var(--paper)' }}>{escrow.toLocaleString()}</div>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 3 }}>Net W/L</div>
              <div className="num" style={{ ...HEAD, fontSize: 'var(--fs-heading)', letterSpacing: '-0.02em', color: netWL >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                {netWL >= 0 ? '+' : ''}{netWL.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setOuterTab(t.key)}
              style={{
                fontSize: 'var(--fs-label)', fontWeight: 600, color: outerTab === t.key ? 'var(--paper)' : 'var(--mute)',
                minHeight: 'var(--tap)', padding: '9px 14px', position: 'relative', cursor: 'pointer',
                background: 'transparent', border: 'none', whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {outerTab === t.key && (
                <span style={{
                  position: 'absolute', left: 14, right: 14, bottom: -1,
                  height: 2, background: 'var(--gold)', borderRadius: 1,
                }} />
              )}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => navigate('/my-bets')}
            style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--accent)', minHeight: 'var(--tap)', padding: '9px 0 9px 14px', background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            All my bets →
          </button>
        </div>
      </div>

      {/* Bets tab — 1:1 challenges and group bets merged into one flow */}
      {outerTab === 'bets' && (
        <div style={{
          flex: 1,
          overflowY: isMobile ? 'visible' : 'auto',
          padding: isMobile ? '16px 16px 88px' : '20px 26px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 20,
        }}>

          {/* Mobile: sidebar content folded above the list */}
          {isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SidebarContent
                balance={balance} escrow={escrow} netWL={netWL}
                history={history} userId={user?.id} streak={streak}
                onNewChallenge={() => setShowCreate(true)}
                onGoToWallet={() => setOuterTab('wallet')}
                isMobile={true}
              />
            </div>
          )}

          {/* Main column */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Incoming section — challenges awaiting a response + bets you're invited to */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Incoming</div>
                {allBets.incoming.length > 0 && (
                  <span style={{
                    background: 'var(--gbg)', color: 'var(--gold-text)',
                    fontSize: 'var(--fs-label)', padding: '1px 8px',
                    borderRadius: 100, fontWeight: 600,
                  }}>{allBets.incoming.length}</span>
                )}
              </div>
              {(loading || (betsEnabled && betsLoading)) ? (
                <LoadingRows rows={3} />
              ) : allBets.incoming.length === 0 ? (
                <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '20px 16px', fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center' }}>
                  Nothing waiting on you.
                </div>
              ) : (
                <div style={{ background: 'var(--gbg)', border: '1px solid rgba(184,114,14,.18)', borderRadius: 'var(--radius)', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {allBets.incoming.map(item => item.kind === 'challenge' ? (
                    <IncomingCard key={`c-${item.id}`} challenge={item} userId={user?.id} onAccept={handleAccept} onDecline={handleDecline} loading={actionLoading} />
                  ) : item.kind === 'open_challenge' ? (
                    <OpenChallengeCard key={`oc-${item.id}`} challenge={item} onClaim={handleClaim} loading={actionLoading} />
                  ) : (
                    <BetCard key={`b-${item.id}`} bet={item} userId={user?.id} section="invited" isOwner={isOwner} onJoin={handleJoinBet} onDecline={handleDeclineBet} loading={betActionLoading} />
                  ))}
                </div>
              )}
            </div>

            {/* Sent + Live — 2-col on desktop, stacked on mobile */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 14,
            }}>
              <div>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 9 }}>Sent · awaiting</div>
                {allBets.sent.length === 0 ? (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '16px', fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center' }}>
                    No sent challenges.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allBets.sent.map(c => <OutgoingCard key={c.id} challenge={c} userId={user?.id} onCancel={handleCancel} loading={actionLoading} />)}
                  </div>
                )}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 'var(--fs-label)',
                    padding: '3px 8px', borderRadius: 100, background: 'var(--nbg)', color: 'var(--neg)',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                    Live
                  </span>
                  <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Active</span>
                </div>
                {allBets.live.length === 0 ? (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '16px', fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center' }}>
                    Nothing live right now.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allBets.live.map(item => item.kind === 'challenge' ? (
                      <LiveCard
                        key={`c-${item.id}`} challenge={item} userId={user?.id}
                        onDeclare={setDeclaringChallenge} onConfirm={handleConfirm} onDispute={handleDispute}
                        loading={actionLoading}
                      />
                    ) : (
                      <BetCard
                        key={`b-${item.id}`} bet={item} userId={user?.id} section="joined" isOwner={isOwner}
                        onAnswer={setAnsweringBet} onClose={handleCloseBet} onCancel={setCancellingBet}
                        loading={betActionLoading}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Owner arbitration — disputed freeform 1:1 challenges between other members */}
            {isOwner && allBets.ownerArbitration.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 'var(--fs-label)', color: 'var(--purple)' }}><Icon name="scales" /> Arbitration needed</div>
                  <span style={{
                    background: 'rgba(140,73,201,.12)', color: 'var(--purple)',
                    fontSize: 'var(--fs-label)', padding: '1px 8px',
                    borderRadius: 100, fontWeight: 600,
                  }}>{allBets.ownerArbitration.length}</span>
                </div>
                <div style={{ background: 'rgba(140,73,201,.06)', border: '1px solid rgba(140,73,201,.24)', borderRadius: 'var(--radius)', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {allBets.ownerArbitration.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{c.question}</div>
                        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{c.challenger_username} vs {c.opponent_username} · <CoinAmt amount={c.stake_coins} size="sm" /></div>
                      </div>
                      <button
                        onClick={() => setArbitratingChallenge(c)}
                        style={{
                          flexShrink: 0, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1.5px solid var(--purple)',
                          background: 'transparent', color: 'var(--purple)', cursor: 'pointer',
                          fontSize: 'var(--fs-label)', fontWeight: 600,
                        }}
                      >Review</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Group bets awaiting an outcome — no 1:1 equivalent (challenges resolve via Live) */}
            {betsEnabled && (
              <BetSection
                title="Awaiting Outcome" bets={allBets.awaitingOutcome} section="awaiting"
                emptyLabel="Nothing waiting on an outcome." userId={user?.id} isOwner={isOwner}
                onDeclare={setDeclaringBet} onDispute={setDisputingBet} loading={betActionLoading}
              />
            )}

            {/* Disputed group bets — disputed 1:1 challenges surface via Owner arbitration above */}
            {betsEnabled && allBets.disputedBets.length > 0 && (
              <BetSection
                title="Disputed" bets={allBets.disputedBets} section="disputed"
                emptyLabel="No disputed bets." userId={user?.id} isOwner={isOwner}
                onDispute={setDisputingBet} onArbitrate={setArbitratingBet} loading={betActionLoading}
              />
            )}

            {/* Settled history */}
            {allBets.history.length > 0 && (
              <div>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 9 }}>Settled this season</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {allBets.history.map(item => item.kind === 'challenge' ? (
                    <HistoryItem key={`c-${item.id}`} challenge={item} userId={user?.id} onRematch={handleRematchChallenge} />
                  ) : (
                    <BetCard key={`b-${item.id}`} bet={item} userId={user?.id} section="history" isOwner={isOwner} onRematch={handleRematchBet} loading={rematchBusy} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop: right sidebar */}
          {!isMobile && (
            <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SidebarContent
                balance={balance} escrow={escrow} netWL={netWL}
                history={history} userId={user?.id} streak={streak}
                onNewChallenge={() => setShowCreate(true)}
                onGoToWallet={() => setOuterTab('wallet')}
                isMobile={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Wallet tab */}
      {outerTab === 'wallet' && (
        <WalletTabContent wallet={wallet} walletLoading={walletLoading} />
      )}

      {/* Mobile: PrimaryActionBar for New Bet */}
      {isMobile && outerTab === 'bets' && (
        <PrimaryActionBar
          icon="swords"
          label="New Bet"
          state="action"
          onPress={() => setShowCreate(true)}
          accent="var(--gold)"
        />
      )}

      {/* New bet modal — picks a kind, then delegates to the matching create modal */}
      {showCreate && (
        <NewBetModal
          onClose={() => setShowCreate(false)}
          onCreateChallenge={createChallenge}
          onCreateBet={createBet}
          wallet={wallet}
          circleId={activeCircleId}
          circleName={activeCircle?.name}
          currentUserId={user?.id}
          members={members}
          footballLeagues={competitions.football}
          betsEnabled={betsEnabled}
        />
      )}

      {/* Rematch — reopens the same create modal pre-filled, bypassing the kind picker */}
      {rematchChallengeSeed && (
        <CreateChallengeModal
          onClose={() => setRematchChallengeSeed(null)}
          onCreate={createChallenge}
          wallet={wallet} circleId={activeCircleId} circleName={activeCircle?.name}
          currentUserId={user?.id} members={members} footballLeagues={competitions.football}
          forcedBetType={rematchChallengeSeed.betType}
          initialOpponentId={rematchChallengeSeed.opponentId}
          initialStakeCoins={rematchChallengeSeed.stakeCoins}
          initialQuestion={rematchChallengeSeed.question}
        />
      )}
      {rematchBetSeed && (
        <CreateGroupBetModal
          onClose={() => setRematchBetSeed(null)}
          onCreate={createBet}
          wallet={wallet} circleId={activeCircleId} circleName={activeCircle?.name}
          members={members} currentUserId={user?.id}
          initialQuestion={rematchBetSeed.question}
          initialAnswerMode={rematchBetSeed.answerMode}
          initialStakeCoins={rematchBetSeed.stakeCoins}
          initialTargetMode={rematchBetSeed.targetMode}
          initialTargetIds={rematchBetSeed.targetIds}
        />
      )}

      {/* Declare Result modal */}
      {declaringChallenge && (
        <DeclareResultModal
          challenge={declaringChallenge}
          userId={user?.id}
          onClose={() => setDeclaringChallenge(null)}
          onSubmit={handleDeclareSubmit}
        />
      )}

      {/* Owner Arbitration modal */}
      {arbitratingChallenge && (
        <ArbitrationModal
          challenge={arbitratingChallenge}
          onClose={() => setArbitratingChallenge(null)}
          onSubmit={handleArbitrateSubmit}
        />
      )}

      {/* Submit answer modal */}
      {answeringBet && (
        <SubmitAnswerModal
          bet={answeringBet}
          userId={user?.id}
          fetchAnswers={fetchAnswers}
          onClose={() => setAnsweringBet(null)}
          onSubmit={handleSubmitAnswer}
        />
      )}

      {/* Declare bet outcome modal */}
      {declaringBet && (
        <DeclareOutcomeModal
          bet={declaringBet}
          fetchParticipants={fetchParticipants}
          fetchAnswers={fetchAnswers}
          onClose={() => setDeclaringBet(null)}
          onSubmit={handleDeclareBetSubmit}
        />
      )}

      {/* Owner arbitrate bet modal */}
      {arbitratingBet && (
        <ArbitrateOutcomeModal
          bet={arbitratingBet}
          fetchParticipants={fetchParticipants}
          fetchAnswers={fetchAnswers}
          onClose={() => setArbitratingBet(null)}
          onSubmit={handleArbitrateBetSubmit}
        />
      )}

      {/* Cancel bet confirmation */}
      {cancellingBet && (
        <ConfirmModal
          title="Cancel this bet?"
          body="All joined participants will be refunded their stake."
          confirmLabel="Cancel Bet"
          cancelLabel="Keep Bet"
          danger
          onConfirm={handleCancelBetConfirmed}
          onCancel={() => setCancellingBet(null)}
        />
      )}

      {/* Dispute bet confirmation */}
      {disputingBet && (
        <ConfirmModal
          title="Dispute this outcome?"
          body="The Clubhouse owner will review and make the final call."
          confirmLabel="Dispute"
          cancelLabel="Never mind"
          danger
          onConfirm={handleDisputeBetConfirmed}
          onCancel={() => setDisputingBet(null)}
        />
      )}
    </div>
  );
}
