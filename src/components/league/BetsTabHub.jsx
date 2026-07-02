import { useState, useMemo } from 'react';
import { useBets } from '../../hooks/useBets';
import BetWidget from '../BetWidget';
import { HubSectionLabel, MobSection } from './HubShared';
import { MONO, DISPLAY } from './HubConstants';
import TourReplayButton from '../TourReplayButton';

// ── Visual styling per slug / category ───────────────────────────────────────

const SLUG_STYLE = {
  match_result:       { g: '◈', tone: 'var(--paper)'    },
  first_team_score:   { g: '⚡', tone: 'var(--paper)'    },
  clean_sheet:        { g: '🧤', tone: 'var(--positive)' },
  lead_at_halftime:   { g: '⏱', tone: 'var(--paper)'    },
  second_half_winner: { g: '▶', tone: 'var(--paper)'    },
  winning_margin:     { g: '📏', tone: 'var(--paper)'    },
  most_corners_team:  { g: '⌒', tone: 'var(--paper)'    },
  penalty_in_match:   { g: '✋', tone: 'var(--paper)'    },
  red_card_in_match:  { g: '🟥', tone: 'var(--paper)'    },
  btts:               { g: '◉', tone: 'var(--paper)'    },
  btts_first_half:    { g: '◉', tone: 'var(--paper)'    },
  comeback_win:       { g: '↩', tone: 'var(--paper)'    },
  goals_ou:           { g: '≷', tone: 'var(--gold)'     },
  first_half_goals_ou:{ g: '≷', tone: 'var(--gold)'     },
  shots_on_target_ou: { g: '≷', tone: 'var(--gold)'     },
  total_corners_ou:   { g: '≷', tone: 'var(--gold)'     },
  card_count_ou:      { g: '≷', tone: 'var(--gold)'     },
  total_offsides_ou:  { g: '≷', tone: 'var(--gold)'     },
  total_subs_ou:      { g: '≷', tone: 'var(--gold)'     },
  goal_interval:      { g: '⏰', tone: 'var(--gold)'     },
  top_scorer:         { g: '🎯', tone: 'var(--cyan)'     },
  anytime_goalscorer: { g: '⚽', tone: 'var(--cyan)'     },
  yellow_card:        { g: '🟨', tone: 'var(--cyan)'     },
  man_of_match:       { g: '★', tone: 'var(--cyan)'      },
  free_bet:           { g: '✏', tone: 'var(--mute)'     },
  player_block:       { g: '◈', tone: 'var(--mute)'     },
};

const CAT_META = {
  match:   { label: 'MATCH',   color: 'var(--paper)', icon: '⚽' },
  stats:   { label: 'STATS',   color: 'var(--gold)',  icon: '📊' },
  players: { label: 'PLAYERS', color: 'var(--cyan)',  icon: '🎯' },
  custom:  { label: 'CUSTOM',  color: 'var(--mute)',  icon: '✏' },
};

function kindOf(bet) {
  const slug = bet.template?.slug ?? '';
  return SLUG_STYLE[slug] ?? { g: '◈', tone: 'var(--paper)' };
}

// ── Single bet card ───────────────────────────────────────────────────────────

function BetCard({ bet, squadId, onSubmitted }) {
  const k = kindOf(bet);
  const accentTone = bet.status === 'resolved'
    ? (bet.mySubmission?.is_correct ? 'var(--positive)' : bet.mySubmission ? 'var(--danger)' : 'var(--rule)')
    : k.tone;

  return (
    <div style={{
      margin: 'clamp(4px, 1.5vw, 8px) clamp(12px, 4vw, 24px)',
      background: 'var(--ink-2)',
      border: '1px solid var(--rule)',
      borderLeft: `3px solid ${accentTone}`,
    }}>
      <div style={{ padding: 'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 18px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: k.tone, fontFamily: DISPLAY, fontSize: 13, background: `${k.tone}15`, border: `1px solid ${k.tone}55`, flexShrink: 0 }}>{k.g}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 'clamp(12px, 3vw, 14px)', color: k.tone, letterSpacing: '-0.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{bet.title?.toUpperCase()}</span>
          {bet.scope_ref && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', flexShrink: 0 }}>· MD{bet.scope_ref}</span>}
          {bet.status !== 'resolved' && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--positive)', padding: '3px 7px', border: '1px solid rgba(34,197,94,.55)', background: 'rgba(34,197,94,.08)', letterSpacing: '.18em', flexShrink: 0 }}>
              +{bet.reward_type === 'budget' ? '€' : ''}{bet.reward_value} {bet.reward_type === 'budget' ? 'M' : 'PTS'}
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
        {/* Widget */}
        <BetWidget bet={bet} squadId={squadId} onSubmitted={onSubmitted} />
      </div>
    </div>
  );
}

// ── Category strip (inside a section) ────────────────────────────────────────

function CategoryStrip({ category, bets, squadId, onSubmitted, collapsible }) {
  const [open, setOpen] = useState(true);
  const meta = CAT_META[category] ?? CAT_META.custom;
  return (
    <div style={{ marginBottom: 4 }}>
      {/* Category label — clickable when collapsible */}
      <div
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        onKeyDown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(o => !o); } : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: 'clamp(5px, 1.5vw, 8px) clamp(12px, 4vw, 24px)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          cursor: collapsible ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 10 }}>{meta.icon}</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: meta.color, letterSpacing: '.2em', flex: 1 }}>{meta.label}</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>{bets.length}</span>
        {collapsible && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginLeft: 8 }}>{open ? '−' : '+'}</span>
        )}
      </div>
      {(!collapsible || open) && bets.map(bet => (
        <BetCard key={bet.id} bet={bet} squadId={squadId} onSubmitted={onSubmitted} />
      ))}
    </div>
  );
}

// ── Section (groups bets by category internally) ──────────────────────────────

const CAT_ORDER = ['match', 'stats', 'players', 'custom'];

function BetSection({ label, sub, tone, bets, squadId, onSubmitted, collapsible, defaultOpen, categoriesCollapsible }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!bets.length) return null;

  // Group by category
  const byCategory = useMemo(() => {
    const map = {};
    for (const bet of bets) {
      const cat = bet.template?.category ?? 'match';
      if (!map[cat]) map[cat] = [];
      map[cat].push(bet);
    }
    return map;
  }, [bets]);

  const cats = CAT_ORDER.filter(c => byCategory[c]?.length);
  const showCategoryLabels = cats.length > 1;

  return (
    <div>
      {/* Section header — desktop */}
      <div className="hidden lg:block">
        <HubSectionLabel
          label={label}
          sub={sub}
          tone={tone}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>{bets.length} TOTAL</span>
              {collapsible && (
                <button
                  onClick={() => setOpen(o => !o)}
                  style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                >
                  {open ? 'COLLAPSE −' : 'EXPAND +'}
                </button>
              )}
            </div>
          }
        />
      </div>
      {/* Section header — mobile */}
      <div className="lg:hidden">
        <MobSection
          label={label}
          sub={sub}
          tone={tone}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>{bets.length}</span>
              {collapsible && (
                <button
                  onClick={() => setOpen(o => !o)}
                  style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                >
                  {open ? '−' : '+'}
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* Body */}
      {(!collapsible || open) && (
        <div>
          {showCategoryLabels
            ? cats.map(cat => (
                <CategoryStrip key={cat} category={cat} bets={byCategory[cat]} squadId={squadId} onSubmitted={onSubmitted} collapsible={categoriesCollapsible} />
              ))
            : bets.map(bet => (
                <BetCard key={bet.id} bet={bet} squadId={squadId} onSubmitted={onSubmitted} />
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Hub ───────────────────────────────────────────────────────────────────────

export default function BetsTabHub({ leagueId, squadId, onReplayTour, currentGW }) {
  const { bets, loading, error, refetch } = useBets(leagueId, squadId);

  const open     = bets.filter(b => b.status === 'open');
  const pending  = bets.filter(b => b.status === 'closed');
  const resolved = bets.filter(b => b.status === 'resolved');
  const ptsBanked = resolved.reduce((sum, b) => sum + (b.mySubmission?.is_correct ? (b.reward_value || 0) : 0), 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>
      {/* Hero strip */}
      <div data-tour="bets-header" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: 'clamp(12px, 2vw, 20px) clamp(14px, 3vw, 24px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px, 1.8vw, 10px)', color: 'var(--cyan)', letterSpacing: '.22em' }}>
            BETS &amp; PREDICTIONS · GW{currentGW ?? '—'}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px, 4vw, 26px)', marginTop: 6, lineHeight: 1.1 }}>
            Make your picks before the deadline.
          </div>
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

      {/* Content */}
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
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', opacity: 0.6, maxWidth: 320, textAlign: 'center' }}>
              The commissioner can create prediction widgets from the Admin tab.
            </div>
          </div>
        )}

        {!loading && !error && bets.length > 0 && (
          <>
            {/* OPEN — always visible, never collapsible */}
            <BetSection
              label="OPEN"
              sub="MAKE YOUR PICKS"
              tone="var(--cyan)"
              bets={open}
              squadId={squadId}
              onSubmitted={refetch}
              collapsible={false}
              defaultOpen={true}
            />

            {/* PENDING RESULTS — collapsible, default collapsed */}
            <BetSection
              label="PENDING RESULTS"
              sub="WAITING ON THE PITCH"
              tone="var(--gold)"
              bets={pending}
              squadId={squadId}
              onSubmitted={refetch}
              collapsible={true}
              defaultOpen={false}
            />

            {/* RESULTS — collapsible section + collapsible categories within */}
            <BetSection
              label="RESULTS"
              sub="HISTORY"
              tone="var(--mute)"
              bets={resolved}
              squadId={squadId}
              onSubmitted={refetch}
              collapsible={true}
              defaultOpen={true}
              categoriesCollapsible={true}
            />
          </>
        )}
      </div>

      <TourReplayButton onReplay={onReplayTour} label="REPLAY BETS GUIDE" title="Replay the bets tour" />
    </div>
  );
}
