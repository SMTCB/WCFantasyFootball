import { useBets } from '../hooks/useBets';
import BetWidget from './BetWidget';

function BetGroup({ title, items, squadId, onSubmitted }) {
  if (!items.length) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-[3px] h-4 rounded-full" style={{ background: 'var(--cyan)' }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map(bet => (
          <BetWidget key={bet.id} bet={bet} squadId={squadId} onSubmitted={onSubmitted} />
        ))}
      </div>
    </div>
  );
}

export default function BetsSection({ leagueId, squadId }) {
  const { bets, loading, error, refetch } = useBets(leagueId, squadId);

  if (!leagueId) {
    return (
      <div className="px-4 py-12 text-center text-[13px]" style={{ color: 'var(--mute)' }}>
        Select a league to view bets.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 py-12 text-center text-[13px]" style={{ color: 'var(--mute)' }}>
        Loading bets…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--danger)' }}>
        Failed to load bets: {error}
      </div>
    );
  }

  const open     = bets.filter(b => b.status === 'open');
  const closed   = bets.filter(b => b.status === 'closed');
  const resolved = bets.filter(b => b.status === 'resolved');

  if (bets.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <div className="text-3xl mb-3">🎯</div>
        <div className="text-[15px] font-black uppercase tracking-tight mb-2" style={{ color: 'var(--paper)' }}>No bets yet</div>
        <div className="text-[13px] leading-relaxed" style={{ color: 'var(--mute)' }}>
          The league commissioner can create prediction widgets here. They'll appear when a matchday is active.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <BetGroup title="Open · Make your picks" items={open} squadId={squadId} onSubmitted={refetch} />
      <BetGroup title="Pending results" items={closed} squadId={squadId} onSubmitted={refetch} />
      <BetGroup title="Results" items={resolved} squadId={squadId} onSubmitted={refetch} />
    </div>
  );
}
