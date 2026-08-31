import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMyBets } from '../hooks/useMyBets';
import { HubSectionLabel, MobSection } from '../components/league/HubShared';
import { MONO, DISPLAY } from '../components/league/HubConstants';
import TabStrip from '../components/shared/TabStrip';

const STATUS_META = {
  open:      { label: 'OPEN',      tone: 'var(--cyan)' },
  closed:    { label: 'AWAITING',  tone: 'var(--gold)' },
  disputed:  { label: 'DISPUTED',  tone: 'var(--danger)' },
  resolved:  { label: 'RESOLVED',  tone: 'var(--mute)' },
  cancelled: { label: 'CANCELLED', tone: 'var(--mute)' },
};

function timeLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ENDED';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

function MyBetCard({ bet, onOpen }) {
  const meta = STATUS_META[bet.status] ?? STATUS_META.open;
  const pendingObjection = bet.status === 'closed' && !!bet.declared_at;
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        margin: 'clamp(4px, 1.5vw, 8px) clamp(12px, 4vw, 24px)',
        background: 'var(--ink-2)', border: '1px solid var(--rule)',
        borderLeft: `3px solid ${meta.tone}`, cursor: 'pointer',
        padding: 'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 18px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--cyan)', letterSpacing: '.16em' }}>
          {bet.circle_name?.toUpperCase()}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: meta.tone, letterSpacing: '.18em' }}>
          {pendingObjection ? 'PENDING OBJECTION' : meta.label}
        </span>
      </div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.4, marginBottom: 8 }}>
        {bet.question}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.1em' }}>
        <span style={{ color: 'var(--gold)' }}>{bet.stake_coins} COINS</span>
        <span>{bet.participant_count} JOINED</span>
        {bet.status === 'open' && bet.ends_at && <span>{timeLeft(bet.ends_at)}</span>}
      </div>
    </button>
  );
}

function Section({ label, sub, tone, bets, onOpen, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!bets.length) return null;
  return (
    <div>
      <div className="hidden lg:block">
        <HubSectionLabel
          label={label} sub={sub} tone={tone}
          right={
            <button onClick={() => setOpen(o => !o)} style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.14em', background: 'none', border: 'none', cursor: 'pointer' }}>
              {bets.length} · {open ? 'COLLAPSE −' : 'EXPAND +'}
            </button>
          }
        />
      </div>
      <div className="lg:hidden">
        <MobSection
          label={label} sub={sub} tone={tone}
          right={
            <button onClick={() => setOpen(o => !o)} style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {bets.length} {open ? '−' : '+'}
            </button>
          }
        />
      </div>
      {open && bets.map(bet => <MyBetCard key={bet.id} bet={bet} onOpen={() => onOpen(bet)} />)}
    </div>
  );
}

export default function MyBetsScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loading, error, circles, myOpenJoined, closedAwaitingDeclare, closedAwaitingResolution, disputed, history } = useMyBets(user?.id);
  const [circleFilter, setCircleFilter] = useState('all');

  const filterBy = (list) => circleFilter === 'all' ? list : list.filter(b => b.circle_id === circleFilter);

  const sections = useMemo(() => ([
    { key: 'open',      label: 'YOUR OPEN BETS',   sub: 'ANSWER OR WAIT', tone: 'var(--cyan)',    bets: filterBy(myOpenJoined),             defaultOpen: true },
    { key: 'declare',   label: 'AWAITING OUTCOME',  sub: 'YOU DECLARE',    tone: 'var(--gold)',    bets: filterBy(closedAwaitingDeclare),     defaultOpen: true },
    { key: 'resolve',   label: 'AWAITING OUTCOME',  sub: 'CREATOR DECLARES', tone: 'var(--gold)',  bets: filterBy(closedAwaitingResolution),  defaultOpen: false },
    { key: 'disputed',  label: 'DISPUTED',          sub: 'UNDER REVIEW',   tone: 'var(--danger)',  bets: filterBy(disputed),                  defaultOpen: true },
    { key: 'history',   label: 'HISTORY',           sub: 'RESOLVED & CANCELLED', tone: 'var(--mute)', bets: filterBy(history),               defaultOpen: false },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [circleFilter, myOpenJoined, closedAwaitingDeclare, closedAwaitingResolution, disputed, history]);

  const totalCoinsStaked = myOpenJoined.reduce((sum, b) => sum + (b.stake_coins || 0), 0);
  const openCount = myOpenJoined.length + closedAwaitingDeclare.length + closedAwaitingResolution.length;

  const openBet = (bet) => navigate(`/challenges?tab=bets&circle=${bet.circle_id}`);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)', minHeight: '100%' }}>
      {/* Hero strip */}
      <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: 'clamp(12px, 2vw, 20px) clamp(14px, 3vw, 24px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px, 1.8vw, 10px)', color: 'var(--cyan)', letterSpacing: '.22em' }}>MY BETS · ALL CLUBHOUSES</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px, 4vw, 26px)', marginTop: 6, lineHeight: 1.1 }}>
            Every group bet you've joined, in one place.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { k: 'IN PLAY',  v: openCount,               tone: 'var(--cyan)' },
            { k: 'DISPUTED', v: disputed.length,         tone: 'var(--danger)' },
            { k: 'STAKED',   v: `${totalCoinsStaked}`,    tone: 'var(--gold)' },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px, 2vw, 16px) clamp(10px, 2.5vw, 20px)', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px, 4vw, 30px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Clubhouse filter */}
      {circles.length > 1 && (
        <TabStrip
          variant="pill"
          accent="var(--cyan)"
          tabs={[{ key: 'all', label: 'ALL' }, ...circles.map(c => ({ key: c.id, label: c.name.toUpperCase() }))]}
          active={circleFilter}
          onTab={setCircleFilter}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, minHeight: 60, overflow: 'auto', paddingBottom: 80 }}>
        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
        )}
        {error && (
          <div style={{ padding: '24px', fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--danger)', letterSpacing: '.18em' }}>FAILED TO LOAD: {error}</div>
        )}
        {!loading && !error && sections.every(s => !s.bets.length) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 28px', gap: 12 }}>
            <div style={{ fontSize: 'var(--fs-title)' }}>🎲</div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.2em' }}>NO GROUP BETS YET</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-label)', color: 'var(--mute)', opacity: 0.6, maxWidth: 320, textAlign: 'center' }}>
              Join or create a group bet from any Clubhouse's Group Bets tab and it'll show up here.
            </div>
          </div>
        )}
        {!loading && !error && sections.map(s => (
          <Section key={s.key} label={s.label} sub={s.sub} tone={s.tone} bets={s.bets} onOpen={openBet} defaultOpen={s.defaultOpen} />
        ))}
      </div>
    </div>
  );
}
