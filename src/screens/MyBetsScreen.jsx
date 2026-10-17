import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMyBets } from '../hooks/useMyBets';
import { HubSectionLabel, MobSection } from '../components/league/HubShared';
import { DISPLAY } from '../components/league/HubConstants';
import TabStrip from '../components/shared/TabStrip';

const STATUS_META = {
  open:      { label: 'Open',      tone: 'var(--accent)' },
  closed:    { label: 'Awaiting',  tone: 'var(--gold)' },
  disputed:  { label: 'DISPUTED',  tone: 'var(--danger)' },
  resolved:  { label: 'Resolved',  tone: 'var(--mute)' },
  cancelled: { label: 'Cancelled', tone: 'var(--mute)' },
};

function timeLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
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
        background: 'var(--card)', border: '1px solid var(--rule)',
        borderLeft: `4px solid ${meta.tone}`, borderRadius: 'var(--radius)', cursor: 'pointer', minHeight: 'var(--tap)',
        padding: 'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 18px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--accent)' }}>
          {bet.circle_name}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: meta.tone }}>
          {pendingObjection ? 'Pending objection' : meta.label}
        </span>
      </div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.4, marginBottom: 8 }}>
        {bet.question}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 'var(--fs-label)', color: 'var(--mute)' }} className="num">
        <span style={{ color: 'var(--gold-text)' }}>{bet.stake_coins} coins</span>
        <span>{bet.participant_count} joined</span>
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
            <button onClick={() => setOpen(o => !o)} style={{ minHeight: 'var(--tap)', padding: '0 8px', fontSize: 'var(--fs-label)', color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {bets.length} · {open ? 'Collapse −' : 'Expand +'}
            </button>
          }
        />
      </div>
      <div className="lg:hidden">
        <MobSection
          label={label} sub={sub} tone={tone}
          right={
            <button onClick={() => setOpen(o => !o)} style={{ minHeight: 'var(--tap)', minWidth: 'var(--tap)', fontSize: 'var(--fs-label)', color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer' }}>
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
    { key: 'open',      label: 'Your open bets',   sub: 'Answer or wait', tone: 'var(--accent)',    bets: filterBy(myOpenJoined),             defaultOpen: true },
    { key: 'declare',   label: 'Awaiting outcome',  sub: 'You declare',    tone: 'var(--gold)',    bets: filterBy(closedAwaitingDeclare),     defaultOpen: true },
    { key: 'resolve',   label: 'Awaiting outcome',  sub: 'Creator declares', tone: 'var(--gold)',  bets: filterBy(closedAwaitingResolution),  defaultOpen: false },
    { key: 'disputed',  label: 'Disputed',          sub: 'Under review',   tone: 'var(--danger)',  bets: filterBy(disputed),                  defaultOpen: true },
    { key: 'history',   label: 'History',           sub: 'Resolved and cancelled', tone: 'var(--mute)', bets: filterBy(history),               defaultOpen: false },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [circleFilter, myOpenJoined, closedAwaitingDeclare, closedAwaitingResolution, disputed, history]);

  const totalCoinsStaked = myOpenJoined.reduce((sum, b) => sum + (b.stake_coins || 0), 0);
  const openCount = myOpenJoined.length + closedAwaitingDeclare.length + closedAwaitingResolution.length;

  const openBet = (bet) => navigate(`/challenges?tab=bets&circle=${bet.circle_id}`);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--card)', flexShrink: 0 }}>
        <div style={{ padding: '20px clamp(14px, 3vw, 24px) 16px', display: 'flex', gap: 10 }}>
          <span aria-hidden style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 'var(--fs-title)', lineHeight: 1.1 }}>My bets</h1>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 4 }}>Every group bet you've joined, across all Clubhouses.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--rule)' }}>
          {[
            { k: 'In play',  v: openCount,               tone: 'var(--accent)' },
            { k: 'Disputed', v: disputed.length,         tone: 'var(--danger)' },
            { k: 'Staked',   v: `${totalCoinsStaked}`,    tone: 'var(--gold-text)' },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px, 2vw, 16px) clamp(10px, 2.5vw, 20px)', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{c.k}</div>
              <div className="num" style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-title)', color: c.tone, marginTop: 4 }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Clubhouse filter */}
      {circles.length > 1 && (
        <TabStrip
          variant="pill"
          accent="var(--accent)"
          tabs={[{ key: 'all', label: 'All' }, ...circles.map(c => ({ key: c.id, label: c.name }))]}
          active={circleFilter}
          onTab={setCircleFilter}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, minHeight: 60, overflow: 'auto', paddingBottom: 80 }}>
        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Loading…</div>
        )}
        {error && (
          <div style={{ padding: '24px', fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>Failed to load: {error}</div>
        )}
        {!loading && !error && sections.every(s => !s.bets.length) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 28px', gap: 12 }}>
            <div style={{ fontSize: 'var(--fs-title)' }}>🎲</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>No group bets yet</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-label)', color: 'var(--mute)', maxWidth: 320, textAlign: 'center' }}>
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
