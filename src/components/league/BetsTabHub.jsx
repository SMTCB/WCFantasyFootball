import { useBets } from '../../hooks/useBets';
import BetWidget from '../BetWidget';
import { HubSectionLabel, MobSection } from './HubShared';
import { MONO, DISPLAY } from './HubConstants';
import TourReplayButton from '../TourReplayButton';

const KIND = {
  top_scorer:   { g: '◉', tone: 'var(--cyan)'   },
  player_block: { g: '⛌', tone: 'var(--danger)' },
  match_result: { g: '◈', tone: 'var(--paper)'  },
  over_under:   { g: '≷', tone: 'var(--gold)'   },
  h2h:          { g: '⚔', tone: 'var(--purple)' },
};

function kindOf(bet) {
  const slug = bet.template?.slug || '';
  if (slug.includes('block')) return KIND.player_block;
  if (slug.includes('top_scorer') || slug.includes('scorer')) return KIND.top_scorer;
  if (slug.includes('match') || slug.includes('result')) return KIND.match_result;
  if (slug.includes('over') || slug.includes('under')) return KIND.over_under;
  if (slug.includes('h2h')) return KIND.h2h;
  return KIND.match_result;
}

function BetSection({ label, sub, tone, bets, squadId, onSubmitted }) {
  if (!bets.length) return null;
  return (
    <div>
      {/* Desktop section label */}
      <div className="hidden lg:block">
        <HubSectionLabel label={label} sub={sub} tone={tone} right={
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>{bets.length} TOTAL</span>
        } />
      </div>
      {/* Mobile section label */}
      <div className="lg:hidden">
        <MobSection label={label} sub={sub} tone={tone}
          right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>{bets.length}</span>}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {bets.map(bet => {
          const k = kindOf(bet);
          const accentTone = bet.status === 'resolved'
            ? (bet.mySubmission?.is_correct ? 'var(--positive)' : bet.mySubmission ? 'var(--danger)' : 'var(--rule)')
            : k.tone;
          return (
            <div key={bet.id} style={{
              margin: 'clamp(6px, 2vw, 10px) clamp(12px, 4vw, 24px)',
              background: 'var(--ink-2)',
              border: '1px solid var(--rule)',
              borderLeft: `3px solid ${accentTone}`,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: 'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 18px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: k.tone, fontFamily: DISPLAY, fontSize: 13, background: `${k.tone}15`, border: `1px solid ${k.tone}55`, flexShrink: 0 }}>{k.g}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(12px, 3vw, 14px)', color: k.tone, letterSpacing: '-0.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{bet.title?.toUpperCase()}</span>
                  {bet.scope_ref && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', flexShrink: 0 }}>· MD{bet.scope_ref}</span>}
                  {bet.status !== 'resolved' && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--positive)', padding: '3px 7px', border: '1px solid rgba(34,197,94,.55)', background: 'rgba(34,197,94,.08)', letterSpacing: '.18em', flexShrink: 0 }}>
                      +{bet.reward_value} {bet.reward_type === 'budget' ? 'M' : 'PTS'}
                    </span>
                  )}
                  {bet.status === 'resolved' && bet.winners_count != null && bet.total_submissions != null && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', flexShrink: 0 }}>
                      {bet.winners_count}/{bet.total_submissions} correct
                    </span>
                  )}
                </div>
                {/* Prompt */}
                <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 13, color: 'var(--paper)', lineHeight: 1.5 }}>{bet.prompt}</div>
                {/* BetWidget renders inline options directly — no nested card */}
                <BetWidget bet={bet} squadId={squadId} onSubmitted={onSubmitted} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BetsTabHub({ leagueId, squadId, onReplayTour }) {
  const { bets, loading, error, refetch } = useBets(leagueId, squadId);

  const open     = bets.filter(b => b.status === 'open');
  const pending  = bets.filter(b => b.status === 'closed');
  const resolved = bets.filter(b => b.status === 'resolved');
  const ptsBanked = resolved.reduce((sum, b) => sum + (b.mySubmission?.is_correct ? (b.reward_value || 0) : 0), 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>
      {/* Hero strip — desktop 4-col, mobile stacked */}
      <div data-tour="bets-header" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        {/* Top section: title + mini stats */}
        <div style={{ padding: 'clamp(12px, 2vw, 20px) clamp(14px, 3vw, 24px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px, 1.8vw, 10px)', color: 'var(--cyan)', letterSpacing: '.22em' }}>BETS &amp; PREDICTIONS · GW—</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px, 4vw, 26px)', marginTop: 6, lineHeight: 1.1 }}>Make your picks before the deadline.</div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { k: 'OPEN',    v: open.length,     tone: 'var(--cyan)'     },
            { k: 'PENDING', v: pending.length,  tone: 'var(--gold)'     },
            { k: 'BANKED',  v: `+${ptsBanked}`, tone: 'var(--positive)' },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px, 2vw, 16px) clamp(10px, 2.5vw, 20px)', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px, 4vw, 30px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div data-tour="bets-list" style={{ flex: 1, minHeight: 60, overflow: 'auto', paddingBottom: 80 }}>
        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING BETS…</div>
        )}
        {error && (
          <div style={{ padding: '24px', fontFamily: MONO, fontSize: 10, color: 'var(--danger)', letterSpacing: '.18em' }}>FAILED TO LOAD: {error}</div>
        )}
        {!loading && !error && bets.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 28px', gap: 12 }}>
            <div style={{ fontSize: 28 }}>🎯</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.2em' }}>NO BETS YET</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', opacity: 0.6, maxWidth: 320, textAlign: 'center' }}>The commissioner can create prediction widgets from the Admin tab.</div>
          </div>
        )}
        {!loading && !error && bets.length > 0 && (
          <>
            <BetSection label="OPEN" sub="MAKE YOUR PICKS" tone="var(--cyan)"   bets={open}     squadId={squadId} onSubmitted={refetch} />
            <BetSection label="PENDING RESULTS" sub="WAITING ON THE PITCH" tone="var(--gold)" bets={pending}  squadId={squadId} onSubmitted={refetch} />
            <BetSection label="RESULTS" sub="HISTORY" tone="var(--mute)"        bets={resolved} squadId={squadId} onSubmitted={refetch} />
          </>
        )}
      </div>

      {/* Tour replay */}
      <TourReplayButton onReplay={onReplayTour} label="REPLAY BETS GUIDE" title="Replay the bets tour" />
    </div>
  );
}
