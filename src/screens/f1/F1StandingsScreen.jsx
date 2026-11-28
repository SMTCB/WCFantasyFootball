import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { LoadingRows } from '../../components/Skeleton';
import { F1Header, MemberRow } from '../../components/f1/F1Kit';

const VIEWS = [
  ['total', 'Total', 'total_points'],
  ['race', 'Race', 'race_points'],
  ['year', 'Season', 'year_points'],
];

export default function F1StandingsScreen() {
  const { paddockId } = useParams();
  const { user } = useAuth();
  const { myPaddocks } = usePaddock();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('total');
  const [yearFinal, setYearFinal] = useState(false);
  const [lastRound, setLastRound] = useState(null);

  const paddock = myPaddocks.find(p => p.paddock_id === paddockId);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddockId }),
      supabase.from('f1_year_results').select('is_final').eq('season', 2026).maybeSingle(),
      supabase.from('f1_races').select('round_number').eq('season', 2026).eq('is_scored', true)
        .order('round_number', { ascending: false }).limit(1),
    ]).then(([lb, yr, last]) => {
      if (cancelled) return;
      setRows(lb.data ?? []);
      setYearFinal(!!yr.data?.is_final);
      setLastRound(last.data?.[0]?.round_number ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [paddockId]);

  const field = VIEWS.find(v => v[0] === view)[2];
  const sorted = [...rows].sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
  // Ties share a position, as on the leaderboard RPC.
  let shown = 0;
  const ranked = sorted.map((r, i) => {
    if (i === 0 || (r[field] ?? 0) !== (sorted[i - 1][field] ?? 0)) shown = i + 1;
    return { ...r, pos: shown };
  });
  const leaderPts = ranked[0]?.[field] ?? 0;

  const eyebrow = [paddock?.name ?? 'F1 league', lastRound ? `after R${lastRound}` : 'no races scored yet'].join(' · ');

  return (
    <div className="f1-screen">
      <div className="sport-col f1-body">
        <F1Header eyebrow={eyebrow} title="Standings" />

        {paddock?.archived && (
          <div className="f1-note mute">This league is archived. The table is final.</div>
        )}

        <div className="sport-split">
          <div className="sport-main" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div className="f1-seg" role="tablist" aria-label="Points shown">
              {VIEWS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={view === key}
                  className={view === key ? 'on' : ''} onClick={() => setView(key)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="f1-card" style={{ overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 16 }}><LoadingRows rows={6} /></div>
              ) : ranked.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 'var(--fs-body)' }}>
                  No standings yet. Picks score after the first race.
                </div>
              ) : (
                <>
                  <div className="f1-card-head" style={{ borderBottom: '1px solid var(--elev)' }}>
                    <span className="f1-eb">Member</span>
                    <span className="f1-eb">PTS · GAP</span>
                  </div>
                  {ranked.map((m, i) => {
                    const pts = m[field] ?? 0;
                    return (
                      <MemberRow
                        key={m.user_id}
                        first={i === 0}
                        rank={m.pos}
                        name={m.display_name}
                        extra={
                          <span style={{ display: 'block', fontWeight: 400, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
                            {m.races_scored ?? 0} race{m.races_scored === 1 ? '' : 's'} scored
                          </span>
                        }
                        value={pts}
                        gapLabel={i === 0 ? 'LEAD' : pts === leaderPts ? '—' : `−${leaderPts - pts}`}
                        me={m.user_id === user?.id}
                        lead={m.pos === 1}
                      />
                    );
                  })}
                </>
              )}
            </div>

            {!yearFinal && (
              <div className="f1-note gold">
                Season points are provisional until the season results are confirmed after the final race.
              </div>
            )}
          </div>

          <div className="sport-aside">
            <div className="f1-card">
              <div className="f1-card-head"><span className="f1-eb">How race picks score</span></div>
              {[
                ['P1 exact', 10], ['P2 exact', 8], ['P3 exact', 6],
                ['On podium, wrong spot', 3], ['First DNF', 5], ['Top team', 5], ['Special', 5], ['All six right', '+3'],
              ].map(([k, v], i) => (
                <div key={k} className="f1-kv" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', minHeight: 40, ...(i === 0 ? { borderTop: '1px solid var(--elev)' } : null) }}>
                  <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>{k}</span>
                  <span className="v">{v}</span>
                </div>
              ))}
              <div style={{ padding: '10px 16px 14px', fontSize: 'var(--fs-micro)', color: 'var(--mute)', borderTop: '1px solid var(--elev)' }}>
                Season bets add 10 points each once the season is settled.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
