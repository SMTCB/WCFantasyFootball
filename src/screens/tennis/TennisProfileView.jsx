import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const TYPE_LABEL = { grand_slam: 'Grand Slam', masters_1000: 'M1000', atp_finals: 'ATP Finals' };
const SURFACE_ICON = { hard: '🎾', clay: '🟤', grass: '🌿', hard_indoor: '🏟️' };

export default function TennisProfileView({ userId, seasonYear = 2026 }) {
  const navigate = useNavigate();
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!userId) return;
      setLoading(true);
      const { data } = await supabase
        .from('tennis_tournament_scores')
        .select(`
          total_points, base_points, ace_card_bonus, captain_bonus, scored_at,
          tournament:tennis_tournaments(id, name, tournament_type, surface, start_date, status)
        `)
        .eq('user_id', userId)
        .order('scored_at', { ascending: false });
      setScores(data ?? []);
      setLoading(false);
    }
    load();
  }, [userId, seasonYear]);

  if (loading) return <div style={{ padding: 20, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)' }}>Loading tennis history…</div>;
  if (scores.length === 0) return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 8 }}>🎾 Tennis</div>
      <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--mute)', margin: 0 }}>No tennis scores yet this season.</p>
      <button
        onClick={() => navigate('/tennis')}
        style={{ marginTop: 12, padding: '9px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        Enter the Player's Box
      </button>
    </div>
  );

  const seasonTotal = scores.reduce((s, r) => s + (r.total_points ?? 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)' }}>🎾 Tennis 2026</div>
        <div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '0.1em', marginRight: 6 }}>SEASON</span>
          <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--accent)' }}>{seasonTotal.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scores.map(s => (
          <div
            key={s.tournament?.id}
            onClick={() => s.tournament?.id && navigate(`/tennis/tournament/${s.tournament.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 18 }}>{SURFACE_ICON[s.tournament?.surface] ?? '🎾'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.tournament?.name ?? '—'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                {TYPE_LABEL[s.tournament?.tournament_type] ?? ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--accent)' }}>
                {s.total_points.toLocaleString()}
              </div>
              {(s.ace_card_bonus > 0 || s.captain_bonus > 0) && (
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--gold)', letterSpacing: '0.06em' }}>
                  {s.ace_card_bonus > 0 && `+${s.ace_card_bonus} ace`}
                  {s.ace_card_bonus > 0 && s.captain_bonus > 0 && ' · '}
                  {s.captain_bonus > 0 && `+${s.captain_bonus} cap`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
