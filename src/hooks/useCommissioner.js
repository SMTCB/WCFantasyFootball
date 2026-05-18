import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Consolidates all commissioner panel state (26 vars) and action handlers
 * into a single hook. Extracted from LeagueScreen to reduce its complexity.
 *
 * Usage:
 *   const commissioner = useCommissioner(leagueId);
 *   // then pass commissioner to <CommissionerPanel commissioner={commissioner} />
 */
export function useCommissioner(leagueId) {
  // ── Shared state ─────────────────────────────────────────────────────────
  const [commLoading, setCommLoading] = useState(false);
  const [commMsg,     setCommMsg]     = useState(null); // { type: 'ok'|'err', text }

  // ── Transfer window ───────────────────────────────────────────────────────
  const [windowOpensAt,   setWindowOpensAt]   = useState('');
  const [windowClosesAt,  setWindowClosesAt]  = useState('');
  const [windowTransfers, setWindowTransfers] = useState('');

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [draftDeadline,   setDraftDeadline]   = useState('');

  // ── Score recalc ──────────────────────────────────────────────────────────
  const [scoreFixtureId,  setScoreFixtureId]  = useState('test-live');

  // ── Bet creation ──────────────────────────────────────────────────────────
  const [betTemplateId,  setBetTemplateId]  = useState('');
  const [betTitle,       setBetTitle]       = useState('');
  const [betPrompt,      setBetPrompt]      = useState('');
  const [betDeadline,    setBetDeadline]    = useState('');
  const [betRewardValue, setBetRewardValue] = useState('5');
  const [betScopeType,   setBetScopeType]   = useState('matchday');
  const [betScopeRef,    setBetScopeRef]    = useState('');
  const [betOptionDraft, setBetOptionDraft] = useState('');
  const [betOptions,     setBetOptions]     = useState([]);

  // ── Bet resolution ────────────────────────────────────────────────────────
  const [openBets,                setOpenBets]                = useState([]);
  const [resolutionBetsLoading,   setResolutionBetsLoading]   = useState(false);
  const [selectedBetForResolution,setSelectedBetForResolution]= useState(null);
  const [betResolutionAnswer,     setBetResolutionAnswer]     = useState('');
  const [betSubmissions,          setBetSubmissions]          = useState([]);
  const [answerGrouped,           setAnswerGrouped]           = useState({});

  // ── Action wrapper ────────────────────────────────────────────────────────
  const commAction = useCallback(async (fn) => {
    setCommLoading(true);
    setCommMsg(null);
    try {
      await fn();
    } catch (e) {
      setCommMsg({ type: 'err', text: e.message || 'Action failed' });
    } finally {
      setCommLoading(false);
    }
  }, []);

  // ── Transfer window actions ───────────────────────────────────────────────
  const openTransferWindow = useCallback(() => commAction(async () => {
    const opens  = windowOpensAt  || new Date().toISOString();
    const closes = windowClosesAt || new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const { error } = await supabase.from('transfer_windows').insert({
      league_id:           leagueId,
      opens_at:            opens,
      closes_at:           closes,
      transfers_remaining: windowTransfers ? Number(windowTransfers) : null,
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Transfer window opened.' });
  }), [commAction, leagueId, windowOpensAt, windowClosesAt, windowTransfers]);

  const closeTransferWindow = useCallback(() => commAction(async () => {
    const { error } = await supabase.from('transfer_windows')
      .update({ closes_at: new Date().toISOString() })
      .eq('league_id', leagueId)
      .gt('closes_at', new Date().toISOString());
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Transfer window closed.' });
  }), [commAction, leagueId]);

  // ── Score recalculation ───────────────────────────────────────────────────
  const triggerScores = useCallback(() => commAction(async () => {
    const { data, error } = await supabase.functions.invoke('calculate-scores', {
      body: { fixture_id: scoreFixtureId },
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: `Scores updated — ${data?.updated_squads ?? 0} squads, ${data?.player_stats ?? 0} player stats.` });
  }), [commAction, scoreFixtureId]);

  // ── Draft deadline ────────────────────────────────────────────────────────
  const setLeagueDraftDeadline = useCallback(() => commAction(async () => {
    if (!draftDeadline) throw new Error('Enter a deadline date/time.');
    const { error } = await supabase.from('leagues')
      .update({ draft_deadline: draftDeadline })
      .eq('id', leagueId);
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Draft deadline set.' });
  }), [commAction, leagueId, draftDeadline]);

  // ── Bet creation ──────────────────────────────────────────────────────────
  const autoGenerateBetOptions = useCallback(async () => {
    if (!betTemplateId) {
      setCommMsg({ type: 'err', text: 'Select a template to auto-generate options.' });
      return;
    }
    try {
      setCommLoading(true);
      let generated = [];

      if (betTemplateId === 'top_scorer' || betTemplateId === 'player_block') {
        const { data: players } = await supabase
          .from('players')
          .select('id, name, position, club')
          .in('position', ['FWD', 'FW', 'MID'])
          .order('price', { ascending: false })
          .limit(8);
        generated = (players || []).map(p => ({
          key: p.id, label: p.name, meta: { club: p.club, pos: p.position },
        }));
      } else if (betTemplateId === 'match_result') {
        const { data: fixtures } = await supabase
          .from('fixtures')
          .select('id, home_team, away_team')
          .in('status', ['scheduled', 'upcoming'])
          .order('kickoff_at', { ascending: true })
          .limit(6);
        generated = (fixtures || []).flatMap(f => [
          { key: `${f.id}_home`, label: `${f.home_team} Win` },
          { key: `${f.id}_draw`, label: 'Draw' },
          { key: `${f.id}_away`, label: `${f.away_team} Win` },
        ]);
        if (!generated.length) {
          generated = [
            { key: 'home_win', label: 'Home Win' },
            { key: 'draw',     label: 'Draw' },
            { key: 'away_win', label: 'Away Win' },
          ];
        }
      }

      if (!generated.length) {
        setCommMsg({ type: 'err', text: 'No options could be generated for this template.' });
        return;
      }
      setBetOptions(generated);
      setCommMsg({ type: 'ok', text: `Auto-generated ${generated.length} options — review and customise before creating.` });
    } catch (err) {
      setCommMsg({ type: 'err', text: err.message || 'Auto-generate failed.' });
    } finally {
      setCommLoading(false);
    }
  }, [betTemplateId]);

  const fetchOpenBets = useCallback(async () => {
    if (!leagueId) return;
    setResolutionBetsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bet_instances')
        .select('*')
        .eq('league_id', leagueId)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOpenBets(data || []);
    } catch (err) {
      console.error('Failed to fetch open bets:', err);
    } finally {
      setResolutionBetsLoading(false);
    }
  }, [leagueId]);

  const createBetInstance = useCallback(() => commAction(async () => {
    if (!betTitle)            throw new Error('Enter a bet title.');
    if (!betPrompt)           throw new Error('Enter a bet prompt/question.');
    if (!betDeadline)         throw new Error('Set a deadline.');
    if (betOptions.length < 2) throw new Error('Add at least 2 answer options.');
    const { error } = await supabase.from('bet_instances').insert({
      league_id:    leagueId,
      template_id:  betTemplateId || null,
      title:        betTitle,
      prompt:       betPrompt,
      options:      betOptions,
      deadline_at:  betDeadline,
      reward_value: Number(betRewardValue) || 5,
      scope_type:   betScopeType,
      scope_ref:    betScopeRef || null,
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Bet instance created.' });
    setBetTitle(''); setBetPrompt(''); setBetDeadline('');
    setBetRewardValue('5'); setBetScopeType('matchday');
    setBetScopeRef(''); setBetTemplateId(''); setBetOptions([]); setBetOptionDraft('');
    await fetchOpenBets();
  }), [commAction, leagueId, betTemplateId, betTitle, betPrompt, betDeadline,
       betRewardValue, betScopeType, betScopeRef, betOptions, fetchOpenBets]);

  // ── Bet resolution ────────────────────────────────────────────────────────
  const fetchBetSubmissions = useCallback(async (betId) => {
    if (!betId) { setBetSubmissions([]); setAnswerGrouped({}); return; }
    try {
      const { data, error } = await supabase
        .from('bet_submissions')
        .select('answer, user_id, squads!squad_id(users!user_id(username))')
        .eq('bet_instance_id', betId);
      if (error) throw error;
      setBetSubmissions(data || []);
      const grouped = {};
      (data || []).forEach(sub => {
        if (!grouped[sub.answer]) grouped[sub.answer] = [];
        grouped[sub.answer].push(sub.squads?.users?.username || 'Unknown');
      });
      setAnswerGrouped(grouped);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    }
  }, []);

  const resolveBet = useCallback(() => commAction(async () => {
    if (!selectedBetForResolution) throw new Error('Select a bet to resolve.');
    if (!betResolutionAnswer)      throw new Error('Select the correct answer.');
    const { data, error } = await supabase.rpc('resolve_bet', {
      p_instance_id:    selectedBetForResolution.id,
      p_correct_answer: betResolutionAnswer,
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: `Bet resolved — ${data?.submissions_updated ?? 0} submissions graded.` });
    setBetResolutionAnswer('');
    setSelectedBetForResolution(null);
    setBetSubmissions([]);
    setAnswerGrouped({});
    await fetchOpenBets();
  }), [commAction, selectedBetForResolution, betResolutionAnswer, fetchOpenBets]);

  return {
    // State + wrapper (exposed so LeagueScreen can use for one-off inline actions)
    commLoading, commMsg, setCommMsg, commAction,
    // Transfer window
    windowOpensAt, setWindowOpensAt,
    windowClosesAt, setWindowClosesAt,
    windowTransfers, setWindowTransfers,
    openTransferWindow, closeTransferWindow,
    // Draft
    draftDeadline, setDraftDeadline, setLeagueDraftDeadline,
    // Score recalc
    scoreFixtureId, setScoreFixtureId, triggerScores,
    // Bet creation
    betTemplateId, setBetTemplateId,
    betTitle, setBetTitle,
    betPrompt, setBetPrompt,
    betDeadline, setBetDeadline,
    betRewardValue, setBetRewardValue,
    betScopeType, setBetScopeType,
    betScopeRef, setBetScopeRef,
    betOptionDraft, setBetOptionDraft,
    betOptions, setBetOptions,
    autoGenerateBetOptions, createBetInstance,
    // Bet resolution
    openBets, resolutionBetsLoading,
    selectedBetForResolution, setSelectedBetForResolution,
    betResolutionAnswer, setBetResolutionAnswer,
    betSubmissions, answerGrouped,
    fetchOpenBets, fetchBetSubmissions, resolveBet,
  };
}
