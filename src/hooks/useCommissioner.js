import { useState, useCallback } from 'react';
import { supabase, FUNCTIONS_BASE } from '../lib/supabase';

async function invokeEdgeFunction(fnName, body) {
  if (!FUNCTIONS_BASE) return { data: null, error: { message: 'Supabase not configured' } };
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session ?? null;
  } catch { /* network/token-store failure — fall through to anon key */ }
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${fnName} failed`;
    try { const b = await res.json(); msg = b?.error ?? msg; } catch { /* ignore */ }
    return { data: null, error: { message: msg } };
  }
  try {
    const data = await res.json();
    return { data: data ?? {}, error: null };
  } catch {
    return { data: null, error: { message: 'Invalid response from server' } };
  }
}


export function useCommissioner(leagueId, tournamentId) {
  // ── Shared state ─────────────────────────────────────────────────────────
  const [commLoading, setCommLoading] = useState(false);
  const [commMsg,     setCommMsg]     = useState(null);

  // ── Transfer window ───────────────────────────────────────────────────────
  const [windowOpensAt,   setWindowOpensAt]   = useState('');
  const [windowClosesAt,  setWindowClosesAt]  = useState('');
  const [windowTransfers, setWindowTransfers] = useState('');

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [draftDeadline, setDraftDeadline] = useState('');

  // ── Score recalc ──────────────────────────────────────────────────────────
  const [scoreFixtureId, setScoreFixtureId] = useState('');


  // ── Bet resolution ────────────────────────────────────────────────────────
  const [openBets,                 setOpenBets]                 = useState([]);
  const [resolutionBetsLoading,    setResolutionBetsLoading]    = useState(false);
  const [selectedBetForResolution, setSelectedBetForResolution] = useState(null);
  const [betResolutionAnswer,      setBetResolutionAnswer]      = useState('');
  const [betSubmissions,           setBetSubmissions]           = useState([]);
  const [answerGrouped,            setAnswerGrouped]            = useState({});

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

  // ── Transfer window ───────────────────────────────────────────────────────
  const openTransferWindow = useCallback(() => commAction(async () => {
    const opens  = windowOpensAt  ? new Date(windowOpensAt).toISOString()  : new Date().toISOString();
    const closes = windowClosesAt ? new Date(windowClosesAt).toISOString() : new Date(Date.now() + 48 * 3600 * 1000).toISOString();
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
    const { data, error } = await invokeEdgeFunction('calculate-scores', { fixture_id: scoreFixtureId });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: `Scores updated — ${data?.updated_squads ?? 0} squads, ${data?.player_stats ?? 0} player stats.` });
  }), [commAction, scoreFixtureId]);

  // Score every finished fixture in the most recently completed round — no
  // need for the commissioner to look up individual fixture IDs manually.
  const triggerScoresLatestRound = useCallback(() => commAction(async () => {
    if (!tournamentId) throw new Error('No tournament configured for this league.');
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, matchday_id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'finished')
      .order('kickoff_at', { ascending: false })
      .limit(30);
    if (!fixtures?.length) throw new Error('No finished fixtures found for this tournament.');
    const latestMD    = fixtures[0].matchday_id;
    const roundFix    = fixtures.filter(f => f.matchday_id === latestMD);
    let totalSquads = 0, totalStats = 0;
    for (const f of roundFix) {
      const { data } = await invokeEdgeFunction('calculate-scores', { fixture_id: f.id });
      if (data) { totalSquads += data.updated_squads ?? 0; totalStats += data.player_stats ?? 0; }
    }
    setCommMsg({ type: 'ok', text: `${latestMD} scored — ${roundFix.length} fixtures, ${totalSquads} squads, ${totalStats} stats.` });
  }), [commAction, tournamentId]);

  // ── Draft deadline ────────────────────────────────────────────────────────
  const setLeagueDraftDeadline = useCallback(() => commAction(async () => {
    if (!draftDeadline) throw new Error('Enter a deadline date/time.');
    const { error } = await supabase.from('leagues')
      .update({ draft_deadline: new Date(draftDeadline).toISOString() })
      .eq('id', leagueId);
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Draft deadline set.' });
  }), [commAction, leagueId, draftDeadline]);

  // ── Run draft allocation ──────────────────────────────────────────────────
  const triggerDraftAllocation = useCallback(() => commAction(async () => {
    const { data, error } = await invokeEdgeFunction('run-draft-lottery', { league_id: leagueId });
    if (error) throw new Error(error.message);
    const managed = data?.managersProcessed ?? 0;
    const contested = data?.contestedPlayers ?? 0;
    const incomplete = data?.incomplete?.length ?? 0;
    setCommMsg({
      type: 'ok',
      text: `Allocation complete — ${managed} squad${managed !== 1 ? 's' : ''} allocated, ${contested} conflict${contested !== 1 ? 's' : ''} resolved${incomplete > 0 ? `, ${incomplete} incomplete` : ''}.`,
    });
  }), [commAction, leagueId]);

  // ── Fetch open/unresolved bets — declared first so createBetDirect can use it ──
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

  // Wizard-driven create: accepts pre-assembled data so wizard state doesn't
  // need to be synced into hook state before calling.
  const createBetFromData = useCallback((data) => commAction(async () => {
    const { title, prompt, deadline, rewardValue, scopeType, scopeRef, templateId, options } = data;
    if (!title)           throw new Error('Enter a bet title.');
    if (!prompt)          throw new Error('Enter a bet prompt.');
    if (!deadline)        throw new Error('Set a deadline.');
    if (!options || options.length < 2) throw new Error('Add at least 2 answer options.');

    // Look up the real UUID for this template slug (templateId is a slug string like 'match_result')
    let resolvedTemplateId = null;
    if (templateId) {
      const { data: tmpl } = await supabase
        .from('bet_templates')
        .select('id')
        .eq('slug', templateId)
        .maybeSingle();
      resolvedTemplateId = tmpl?.id ?? null;
    }

    const { error } = await supabase.from('bet_instances').insert({
      league_id:    leagueId,
      template_id:  resolvedTemplateId,
      title,
      prompt,
      options,
      deadline_at:  new Date(deadline).toISOString(),
      reward_value: Number(rewardValue) || 5,
      reward_type:  'points',
      scope_type:   scopeType || 'matchday',
      scope_ref:    scopeRef || null,
      status:       'open',
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Bet created and published to the league.' });
    await fetchOpenBets();
  }), [commAction, leagueId, fetchOpenBets]);

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

  const voidBet = useCallback((betInstanceId) => commAction(async () => {
    const { data, error } = await supabase.rpc('void_bet', { p_instance_id: betInstanceId });
    if (error) throw new Error(error.message);
    if (data?.ok === false) throw new Error(data.error || 'Void failed');
    setCommMsg({ type: 'ok', text: `Bet voided — ${data?.submissions_cleared ?? 0} picks cleared.` });
    setSelectedBetForResolution(null);
    setBetSubmissions([]);
    setAnswerGrouped({});
    await fetchOpenBets();
  }), [commAction, fetchOpenBets]);

  const resolveBet = useCallback(() => commAction(async () => {
    if (!selectedBetForResolution) throw new Error('Select a bet to resolve.');
    if (!betResolutionAnswer)      throw new Error('Select the correct answer.');
    const { data, error } = await supabase.rpc('resolve_bet', {
      p_instance_id: selectedBetForResolution.id,
      p_answer:      betResolutionAnswer,
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
    commLoading, commMsg, setCommMsg, commAction,
    windowOpensAt, setWindowOpensAt,
    windowClosesAt, setWindowClosesAt,
    windowTransfers, setWindowTransfers,
    openTransferWindow, closeTransferWindow,
    draftDeadline, setDraftDeadline, setLeagueDraftDeadline, triggerDraftAllocation,
    scoreFixtureId, setScoreFixtureId, triggerScores, triggerScoresLatestRound,
    createBetFromData,
    openBets, resolutionBetsLoading,
    selectedBetForResolution, setSelectedBetForResolution,
    betResolutionAnswer, setBetResolutionAnswer,
    betSubmissions, answerGrouped,
    fetchOpenBets, fetchBetSubmissions, resolveBet, voidBet,
  };
}
