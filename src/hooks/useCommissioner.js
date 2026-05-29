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

// 3.2: slug→id at call-time; avoids hardcoded UUIDs that differ per environment
async function templateIdForSlug(slug) {
  const { data } = await supabase.from('bet_templates').select('id').eq('slug', slug).maybeSingle();
  return data?.id ?? null;
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
  const [scoreFixtureId, setScoreFixtureId] = useState('test-live');

  // ── Bet creation state (legacy — used by resolution panel) ───────────────
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
      .update({ draft_deadline: draftDeadline })
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

  // ── Bet creation — new direct API used by BetCreatorPanel ────────────────
  const createBetDirect = useCallback(async (betData) => {
    const { template, title, prompt, options, deadline, rewardValue, rewardType, scopeType, scopeRef } = betData;
    if (!title)             throw new Error('Enter a bet title.');
    if (!prompt)            throw new Error('Enter a bet question/prompt.');
    if (!deadline)          throw new Error('Set a submission deadline.');
    if (options.length < 2) throw new Error('Add at least 2 answer options.');
    const tplId = template ? await templateIdForSlug(template) : null;
    const { error } = await supabase.from('bet_instances').insert({
      league_id:    leagueId,
      template_id:  tplId,
      title,
      prompt,
      options,
      deadline_at:  new Date(deadline).toISOString(),
      reward_value: Number(rewardValue) || 5,
      reward_type:  rewardType || 'points',
      scope_type:   scopeType || 'matchday',
      scope_ref:    scopeRef || null,
    });
    if (error) throw new Error(error.message);
    await fetchOpenBets();
  }, [leagueId, fetchOpenBets]);

  // ── Bet creation — legacy auto-generate (fixed filters) ──────────────────
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
          .eq('tournament_id', tournamentId || '426')
          .in('position', ['FWD', 'MID'])
          .order('price', { ascending: false })
          .limit(8);
        generated = (players || []).map(p => ({
          key: p.id, label: p.name, meta: { club: p.club, pos: p.position },
        }));
      } else if (betTemplateId === 'match_result') {
        let query = supabase
          .from('fixtures')
          .select('id, home_team, away_team, kickoff_at')
          .eq('tournament_id', tournamentId || '426')
          .eq('status', 'scheduled')
          .order('kickoff_at', { ascending: true })
          .limit(3);
        if (betDeadline) query = query.lte('kickoff_at', new Date(betDeadline).toISOString());
        const { data: fixtures } = await query;
        generated = (fixtures || []).flatMap(f => [
          { key: `${f.id}_home`, label: `${f.home_team} Win`, meta: {} },
          { key: `${f.id}_draw`, label: 'Draw', meta: {} },
          { key: `${f.id}_away`, label: `${f.away_team} Win`, meta: {} },
        ]);
        if (!generated.length) {
          generated = [
            { key: 'home_win', label: 'Home Win', meta: {} },
            { key: 'draw',     label: 'Draw', meta: {} },
            { key: 'away_win', label: 'Away Win', meta: {} },
          ];
        }
      }
      if (!generated.length) {
        setCommMsg({ type: 'err', text: 'No options could be generated for this template.' });
        return;
      }
      setBetOptions(generated);
      setCommMsg({ type: 'ok', text: `Auto-generated ${generated.length} options.` });
    } catch (err) {
      setCommMsg({ type: 'err', text: err.message || 'Auto-generate failed.' });
    } finally {
      setCommLoading(false);
    }
  }, [betTemplateId, betDeadline, tournamentId]);

  // ── Legacy create (still used by old form if any) ─────────────────────────
  const createBetInstance = useCallback(() => commAction(async () => {
    if (!betTitle)             throw new Error('Enter a bet title.');
    if (!betPrompt)            throw new Error('Enter a bet prompt/question.');
    if (!betDeadline)          throw new Error('Set a deadline.');
    if (betOptions.length < 2) throw new Error('Add at least 2 answer options.');
    const tplId = betTemplateId ? await templateIdForSlug(betTemplateId) : null;
    const { error } = await supabase.from('bet_instances').insert({
      league_id:    leagueId,
      template_id:  tplId,
      title:        betTitle,
      prompt:       betPrompt,
      options:      betOptions,
      deadline_at:  new Date(betDeadline).toISOString(),
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
    betTemplateId, setBetTemplateId,
    betTitle, setBetTitle,
    betPrompt, setBetPrompt,
    betDeadline, setBetDeadline,
    betRewardValue, setBetRewardValue,
    betScopeType, setBetScopeType,
    betScopeRef, setBetScopeRef,
    betOptionDraft, setBetOptionDraft,
    betOptions, setBetOptions,
    autoGenerateBetOptions, createBetInstance, createBetDirect, createBetFromData,
    openBets, resolutionBetsLoading,
    selectedBetForResolution, setSelectedBetForResolution,
    betResolutionAnswer, setBetResolutionAnswer,
    betSubmissions, answerGrouped,
    fetchOpenBets, fetchBetSubmissions, resolveBet,
  };
}
