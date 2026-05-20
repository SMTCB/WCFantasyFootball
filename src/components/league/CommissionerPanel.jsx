import { supabase } from '../../lib/supabase';
import { HubSectionLabel } from './HubShared';

/**
 * Commissioner admin panel — receives all state and handlers from useCommissioner
 * via the `commissioner` prop object. Keeps LeagueScreen free of 400+ lines of
 * admin-only JSX while retaining full access to the hook's state.
 */
export default function CommissionerPanel({ commissioner, leagueId, replayCommissionerTour }) {
  const {
    commLoading, commMsg, setCommMsg, commAction,
    windowOpensAt, setWindowOpensAt,
    windowClosesAt, setWindowClosesAt,
    windowTransfers, setWindowTransfers,
    openTransferWindow, closeTransferWindow,
    draftDeadline, setDraftDeadline, setLeagueDraftDeadline, triggerDraftAllocation,
    scoreFixtureId, setScoreFixtureId, triggerScores,
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
    openBets, resolutionBetsLoading,
    selectedBetForResolution, setSelectedBetForResolution,
    betResolutionAnswer, setBetResolutionAnswer,
    betSubmissions, answerGrouped,
    fetchBetSubmissions, resolveBet,
  } = commissioner;

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--ink)' }}>
      <HubSectionLabel label="COMMISSIONER CONTROLS" sub="ADMIN ONLY" tone="var(--purple)"
        right={<button onClick={replayCommissionerTour} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>}
      />
      <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>

        {/* Feedback message */}
        {commMsg && (
          <div className={`px-4 py-3 rounded-sm text-[12px] font-bold flex items-center justify-between ${commMsg.type === 'ok' ? 'bg-positive/10 border border-positive/30 text-positive' : 'bg-negative/10 border border-negative/30 text-negative'}`}>
            <span>{commMsg.text}</span>
            <button onClick={() => setCommMsg(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
          </div>
        )}

        {/* ── Transfer Window ───────────────────────────────────────── */}
        <div data-tour="comm-transfer-window" className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Transfer Window</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Opens at</label>
              <input type="datetime-local" value={windowOpensAt} onChange={e => setWindowOpensAt(e.target.value)} className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Closes at</label>
              <input type="datetime-local" value={windowClosesAt} onChange={e => setWindowClosesAt(e.target.value)} className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Transfers allowed (blank = unlimited)</label>
            <input type="number" min="1" value={windowTransfers} onChange={e => setWindowTransfers(e.target.value)} placeholder="e.g. 5" className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={openTransferWindow} disabled={commLoading} className="py-3 bg-positive text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50">Open Window</button>
            <button onClick={closeTransferWindow} disabled={commLoading} className="py-3 bg-[#1e1e1e] border border-[#2a2a2a] text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50">Close Now</button>
          </div>
        </div>

        {/* ── Draft Deadline ────────────────────────────────────────── */}
        <div data-tour="comm-draft-deadline" className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Draft Deadline</div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Deadline (date & time)</label>
            <input type="datetime-local" value={draftDeadline} onChange={e => setDraftDeadline(e.target.value)} className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
          </div>
          <button onClick={setLeagueDraftDeadline} disabled={commLoading} className="w-full py-3 bg-[#1B5E20] text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50">Set Draft Deadline</button>
        </div>

        {/* ── Run Draft Allocation ──────────────────────────────────── */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Run Draft Allocation</div>
          <p className="text-[11px] text-text-tertiary">Resolve conflicts via lottery and allocate 15 players to each manager's squad. Enforces budget (£100M) and position limits (GK≤2, DEF≤5, MID≤5, FWD≤3).</p>
          <button
            onClick={triggerDraftAllocation}
            disabled={commLoading}
            className="w-full py-3 text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
            style={{ background: commLoading ? undefined : 'var(--gold)' }}
          >
            {commLoading ? 'Running…' : 'Run Allocation Now'}
          </button>
        </div>

        {/* ── Score Recalculation ───────────────────────────────────── */}
        <div data-tour="comm-score-recalc" className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Score Recalculation</div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Fixture ID</label>
            <input type="text" value={scoreFixtureId} onChange={e => setScoreFixtureId(e.target.value)} placeholder="e.g. test-live, md1-f1" className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
          </div>
          <button onClick={triggerScores} disabled={commLoading || !scoreFixtureId} className="w-full py-3 bg-yellow-600 text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50">
            {commLoading ? 'Running…' : 'Recalculate Scores'}
          </button>
        </div>

        {/* ── Cup Phase ─────────────────────────────────────────────── */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Cup Phase</div>
          <p className="text-[11px] text-text-tertiary">Seeding cup clubs activates the no-repeat pool. Use after draft allocations are set.</p>
          <button
            onClick={() => commAction(async () => {
              const { error } = await supabase.rpc('seed_cup_clubs', { p_league_id: leagueId });
              if (error) throw new Error(error.message);
              setCommMsg({ type: 'ok', text: 'Cup clubs seeded.' });
            })}
            disabled={commLoading}
            className="w-full py-3 bg-purple-700 text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
          >
            Seed Cup Clubs
          </button>
        </div>

        {/* ── Create Bet Instance ───────────────────────────────────── */}
        <div data-tour="comm-bets" className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Create Bet Instance</div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Template (optional)</label>
            <div className="flex gap-1.5">
              <select value={betTemplateId} onChange={e => setBetTemplateId(e.target.value)} className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40">
                <option value="">None</option>
                <option value="top_scorer">Matchday Top Scorer</option>
                <option value="match_result">Match Result</option>
                <option value="player_block">Player Block</option>
              </select>
              {betTemplateId && (
                <button onClick={autoGenerateBetOptions} disabled={commLoading} title="Auto-populate options from this template" className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50 shrink-0" style={{ background: 'rgba(0,196,232,0.15)', color: 'var(--cyan)', border: '1px solid rgba(0,196,232,0.3)' }}>⚡ Auto</button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Title</label>
            <input type="text" value={betTitle} onChange={e => setBetTitle(e.target.value)} placeholder="e.g. Who scores first?" className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Prompt/Question</label>
            <textarea value={betPrompt} onChange={e => setBetPrompt(e.target.value)} placeholder="e.g. Which player will score the most goals?" className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40 resize-none h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Deadline</label>
              <input type="datetime-local" value={betDeadline} onChange={e => setBetDeadline(e.target.value)} className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Reward Value</label>
              <input type="number" value={betRewardValue} onChange={e => setBetRewardValue(e.target.value)} min="1" className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Scope Type</label>
              <select value={betScopeType} onChange={e => setBetScopeType(e.target.value)} className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40">
                <option value="matchday">Matchday</option>
                <option value="match">Match</option>
                <option value="season">Season</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Scope Ref (optional)</label>
              <input type="text" value={betScopeRef} onChange={e => setBetScopeRef(e.target.value)} placeholder="e.g. MD4, f-123" className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Answer Options <span style={{ color: 'var(--danger)' }}>*</span></label>
            {betOptions.length > 0 && (
              <div className="flex flex-col gap-1 mb-1">
                {betOptions.map((opt, idx) => (
                  <div key={opt.key} className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-1.5 rounded-sm">
                    <span className="text-[9px] text-white/30 w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-[11px] text-white flex-1">{opt.label}</span>
                    <button onClick={() => setBetOptions(prev => prev.filter((_, i) => i !== idx))} className="text-[10px] text-danger/60 hover:text-danger transition-colors shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={betOptionDraft}
                onChange={e => setBetOptionDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && betOptionDraft.trim()) {
                    const label = betOptionDraft.trim();
                    const key   = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    setBetOptions(prev => [...prev, { key: key || `opt_${prev.length + 1}`, label }]);
                    setBetOptionDraft('');
                  }
                }}
                placeholder="Type option, press Enter or Add"
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
              />
              <button
                onClick={() => {
                  const label = betOptionDraft.trim();
                  if (!label) return;
                  const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  setBetOptions(prev => [...prev, { key: key || `opt_${prev.length + 1}`, label }]);
                  setBetOptionDraft('');
                }}
                className="px-3 py-2 bg-[#2a2a2a] text-white text-[10px] font-black uppercase tracking-widest rounded-sm hover:bg-[#3a3a3a] transition-colors"
              >Add</button>
            </div>
            {betOptions.length < 2 && <span className="text-[9px]" style={{ color: 'var(--mute)' }}>Minimum 2 options required.</span>}
          </div>
          <button onClick={createBetInstance} disabled={commLoading} className="w-full py-3 bg-[#FF6B00] text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50">Create Bet Instance</button>
        </div>

        {/* ── Resolve Bet Instance ──────────────────────────────────── */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Resolve Bet Instance</div>
          {resolutionBetsLoading ? (
            <div className="text-[11px] text-text-secondary">Loading open bets...</div>
          ) : openBets.length === 0 ? (
            <div className="text-[11px] text-text-secondary">No open or closed bets to resolve.</div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Select Bet</label>
                <select
                  value={selectedBetForResolution?.id || ''}
                  onChange={e => {
                    const bet = openBets.find(b => b.id === e.target.value);
                    setSelectedBetForResolution(bet);
                    setBetResolutionAnswer('');
                    fetchBetSubmissions(bet?.id || null);
                  }}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                >
                  <option value="">None</option>
                  {openBets.map(bet => (
                    <option key={bet.id} value={bet.id}>{bet.title} ({bet.status})</option>
                  ))}
                </select>
              </div>

              {selectedBetForResolution && (
                <>
                  <div className="bg-[#1a1a1a] p-3 rounded-sm space-y-2 border border-[#2a2a2a]">
                    <div className="text-[10px] font-bold text-text-secondary">Prompt:</div>
                    <div className="text-[11px] text-white">{selectedBetForResolution.prompt}</div>
                    <div className="text-[10px] font-bold text-text-secondary mt-2">Reward:</div>
                    <div className="text-[11px] text-white">{selectedBetForResolution.reward_value} {selectedBetForResolution.reward_type === 'points' ? 'pts' : '£M'}</div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Select Correct Answer</label>
                    {Array.isArray(selectedBetForResolution.options) && selectedBetForResolution.options.length > 0 && (
                      <>
                        <div className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Bet options</div>
                        <div className="flex flex-col gap-1">
                          {selectedBetForResolution.options.map(opt => {
                            const optKey   = opt.key ?? opt;
                            const optLabel = opt.label ?? opt;
                            const subCount = answerGrouped[optKey]?.length ?? 0;
                            const isSelected = betResolutionAnswer === optKey;
                            return (
                              <button key={optKey} onClick={() => setBetResolutionAnswer(optKey)} className={`p-2 rounded-sm text-[11px] font-bold transition-all text-left ${isSelected ? 'bg-green-700/60 border border-green-600 text-white' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-text-secondary hover:border-[#3a3a3a]'}`}>
                                <div>{optLabel}</div>
                                <div className="text-[9px] text-text-tertiary">{subCount > 0 ? `${subCount} submission${subCount !== 1 ? 's' : ''}` : 'No submissions'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {betSubmissions.length > 0 && Object.keys(answerGrouped).some(a => !selectedBetForResolution.options?.some(o => (o.key ?? o) === a)) && (
                      <>
                        <div className="text-[8px] uppercase tracking-widest mt-1" style={{ color: 'var(--mute)' }}>Submitted answers</div>
                        <div className="flex flex-col gap-1">
                          {Object.entries(answerGrouped)
                            .filter(([a]) => !selectedBetForResolution.options?.some(o => (o.key ?? o) === a))
                            .map(([answer, users]) => (
                              <button key={answer} onClick={() => setBetResolutionAnswer(answer)} className={`p-2 rounded-sm text-[11px] font-bold transition-all text-left ${betResolutionAnswer === answer ? 'bg-green-700/60 border border-green-600 text-white' : 'bg-[#1a1a1a] border border-[#2a2a2a] text-text-secondary hover:border-[#3a3a3a]'}`}>
                                <div>{answer}</div>
                                <div className="text-[9px] text-text-tertiary">{users.length} submission{users.length !== 1 ? 's' : ''}</div>
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                    {betSubmissions.length === 0 && (!selectedBetForResolution.options || selectedBetForResolution.options.length === 0) && (
                      <div className="text-[10px] text-text-secondary italic">No submissions and no options defined.</div>
                    )}
                    <div className="text-[8px] uppercase tracking-widest mt-1" style={{ color: 'var(--mute)' }}>Manual override</div>
                    <input
                      type="text"
                      placeholder="Type custom correct answer…"
                      onChange={e => setBetResolutionAnswer(e.target.value)}
                      value={betResolutionAnswer && !selectedBetForResolution.options?.some(o => (o.key ?? o) === betResolutionAnswer) && !answerGrouped[betResolutionAnswer] ? betResolutionAnswer : ''}
                      className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                    />
                    {betResolutionAnswer && !answerGrouped[betResolutionAnswer] && !selectedBetForResolution.options?.some(o => (o.key ?? o) === betResolutionAnswer) && (
                      <div className="bg-yellow-900/30 border border-yellow-700/50 p-2 rounded-sm text-[10px] text-yellow-200">
                        ⚠ Override: "{betResolutionAnswer}" — not in submissions or options. Awards reward only to exact matches.
                      </div>
                    )}
                  </div>
                </>
              )}

              <button onClick={resolveBet} disabled={commLoading || !selectedBetForResolution || !betResolutionAnswer} className="w-full py-3 bg-purple-700 text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50">Resolve Bet</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
