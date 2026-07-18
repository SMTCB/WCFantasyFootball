import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import BottomSheet from './shared/BottomSheet';

/**
 * H2HSheet — Feature 05: Head-to-Head Records
 *
 * A full bottom-sheet that shows the lifetime rivalry record
 * between the current user and a selected rival.
 *
 * Props:
 *   leagueId - the current league id
 *   myId     - current user's id
 *   rival    - { user_id, name, rank, total_points } object from the leaderboard
 *   myName   - current user display name
 *   onClose  - dismiss callback
 */

const DEFAULT_H2H = {
  wins: 0, losses: 0, draws: 0,
  streak: { type: 'none', count: 0 },
  biggestWin: null, biggestLoss: null, closest: null,
  history: [],
};

// ─── Tiny Sparkline (pure SVG — no extra deps) ───────────────────────────────
function Sparkline({ data, myColor = 'var(--positive)', rivalColor = 'var(--danger)', width = 280, height = 60 }) {
  if (!data || data.length === 0) return null;

  const allValues = data.flatMap(d => [d.me, d.them]);
  const minV = Math.min(...allValues) - 5;
  const maxV = Math.max(...allValues) + 5;
  const range = maxV - minV || 1;

  const xStep = width / (data.length - 1 || 1);
  const yPos  = (v) => height - ((v - minV) / range) * height;

  const path = (key) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${i * xStep},${yPos(d[key])}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={0} y1={height * f} x2={width} y2={height * f} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
      ))}

      {/* Rival line */}
      <path d={path('them')} fill="none" stroke={rivalColor} strokeWidth={1.5} strokeOpacity={0.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* My line */}
      <path d={path('me')} fill="none" stroke={myColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points — me */}
      {data.map((d, i) => (
        <circle key={i} cx={i * xStep} cy={yPos(d.me)} r={2.5} fill={myColor} />
      ))}
    </svg>
  );
}

// ─── Streak badge ─────────────────────────────────────────────────────────────
function StreakBadge({ streak }) {
  if (!streak || streak.type === 'none') return null;
  const isWin = streak.type === 'win';
  return (
    <span
      className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-sm ml-2"
      style={{
        color:           isWin ? 'var(--ink)' : 'white',
        backgroundColor: isWin ? 'var(--positive)' : 'var(--danger)',
      }}
    >
      {isWin ? `${streak.count}W` : `↓ ${streak.count}L`} streak
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function H2HSheet({ leagueId, myId, rival, myName = 'You', onClose }) {
  const [h2h, setH2h] = useState(DEFAULT_H2H);
  const [, setLoading] = useState(true);

  useEffect(() => {
    async function fetchH2H() {
      if (!leagueId || !myId || !rival?.user_id) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('h2h_records')
          .select('*')
          .eq('league_id', leagueId)
          .or(`and(user_a_id.eq.${myId},user_b_id.eq.${rival.user_id}),and(user_a_id.eq.${rival.user_id},user_b_id.eq.${myId})`)
          .order('matchday_id', { ascending: true });
        
        if (error) throw error;
        
        // Parse data
        let wins = 0, losses = 0, draws = 0;
        let pHistory = [];
        let biggestWin = null, biggestLoss = null, closest = null;
        let currentStreak = 0;
        let streakType = 'none';

        if (data && data.length > 0) {
           data.forEach(d => {
              const myPoints = d.user_a_id === myId ? d.user_a_points : d.user_b_points;
              const theirPoints = d.user_a_id === rival.user_id ? d.user_a_points : d.user_b_points;
              
              if (myPoints > theirPoints) {
                 wins++;
                 if (streakType === 'win') currentStreak++;
                 else { streakType = 'win'; currentStreak = 1; }
                 
                 const margin = myPoints - theirPoints;
                 if (!biggestWin || margin > (biggestWin.myScore - biggestWin.theirScore)) {
                    biggestWin = { matchday: d.matchday_id, myScore: myPoints, theirScore: theirPoints };
                 }
              } else if (theirPoints > myPoints) {
                 losses++;
                 if (streakType === 'loss') currentStreak++;
                 else { streakType = 'loss'; currentStreak = 1; }
                 
                 const margin = theirPoints - myPoints;
                 if (!biggestLoss || margin > (biggestLoss.theirScore - biggestLoss.myScore)) {
                    biggestLoss = { matchday: d.matchday_id, myScore: myPoints, theirScore: theirPoints };
                 }
              } else {
                 draws++;
                 streakType = 'none';
                 currentStreak = 0;
                 if (!closest) {
                    closest = { matchday: d.matchday_id, myScore: myPoints, theirScore: theirPoints };
                 }
              }
              
              pHistory.push({ md: parseInt(d.matchday_id), me: myPoints || 0, them: theirPoints || 0 });
              
              const diff = Math.abs(myPoints - theirPoints);
              if (!closest || diff < Math.abs(closest.myScore - closest.theirScore)) {
                 closest = { matchday: d.matchday_id, myScore: myPoints, theirScore: theirPoints };
              }
           });
        }

        setH2h({
           wins, losses, draws,
           streak: { type: streakType, count: currentStreak },
           biggestWin, biggestLoss, closest,
           history: pHistory
        });
      } catch (err) {
        console.error("H2H fetch error", err);
      } finally {
        setLoading(false);
      }
    }
    fetchH2H();
  }, [leagueId, myId, rival]);

  const total = h2h.wins + h2h.losses + h2h.draws;
  const winPct  = total > 0 ? Math.round((h2h.wins  / total) * 100) : 0;
  const lossPct = total > 0 ? Math.round((h2h.losses / total) * 100) : 0;

  return (
    <BottomSheet onClose={onClose} background="var(--ink)" maxHeight="90vh" maxWidth={448}>
        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-1">
                Head-to-Head · All Time
              </div>
              <div className="flex items-center gap-1">
                <h2 className="text-[16px] font-black uppercase tracking-tight">
                  {myName} vs {rival?.name}
                </h2>
                <StreakBadge streak={h2h.streak} />
              </div>
            </div>
            <button
              onClick={onClose}
              className="fk-mono w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-white transition-colors" style={{ border: '1px solid var(--rule)', fontSize: 14 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* ── W / D / L scoreboard ─────────────────────── */}
          <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5">
            {[
              { label: 'Wins',   value: h2h.wins,   color: 'var(--positive)' },
              { label: 'Draws',  value: h2h.draws,  color: 'var(--mute)' },
              { label: 'Losses', value: h2h.losses, color: 'var(--danger)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center py-5 gap-1">
                <div className="text-4xl font-black tabular-nums" style={{ color }}>{value}</div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary">{label}</div>
              </div>
            ))}
          </div>

          {/* ── Win % bar ────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-white/5">
            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-text-tertiary mb-2">
              <span className="text-positive">{myName} {winPct}%</span>
              <span className="text-negative">{rival?.name} {lossPct}%</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex">
              <div className="h-full bg-positive rounded-l-full transition-all duration-700" style={{ width: `${winPct}%` }} />
              {h2h.draws > 0 && <div className="h-full bg-white/20" style={{ width: `${100 - winPct - lossPct}%` }} />}
              <div className="h-full bg-negative rounded-r-full transition-all duration-700" style={{ width: `${lossPct}%` }} />
            </div>
          </div>

          {/* ── Sparkline ────────────────────────────────── */}
          {h2h.history.length > 0 && (
            <div className="px-5 py-4 border-b border-white/5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary">Points per Matchday</span>
                <div className="flex items-center gap-3 text-[9px] font-bold">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-positive inline-block" />{myName}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-negative inline-block" />{rival?.name}</span>
                </div>
              </div>
              <Sparkline data={h2h.history} />
              {/* MD axis labels */}
              <div className="flex justify-between mt-2">
                {h2h.history.map(d => (
                  <span key={d.md} className="text-[8px] text-text-tertiary font-bold">MD{d.md}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Milestones ───────────────────────────────── */}
          <div className="divide-y divide-white/5">
            {h2h.biggestWin && (
              <div className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.15em] text-positive mb-0.5">Biggest Win</div>
                  <div className="text-[12px] font-bold">Matchday {h2h.biggestWin.matchday}</div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] font-black tabular-nums">
                    <span className="text-positive">{h2h.biggestWin.myScore}</span>
                    <span className="text-text-tertiary mx-1">–</span>
                    <span className="text-text-secondary">{h2h.biggestWin.theirScore}</span>
                  </div>
                  <div className="text-[9px] text-positive font-bold">+{h2h.biggestWin.myScore - h2h.biggestWin.theirScore} pts margin</div>
                </div>
              </div>
            )}

            {h2h.biggestLoss && (
              <div className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.15em] text-negative mb-0.5">Biggest Loss</div>
                  <div className="text-[12px] font-bold">Matchday {h2h.biggestLoss.matchday}</div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] font-black tabular-nums">
                    <span className="text-text-secondary">{h2h.biggestLoss.myScore}</span>
                    <span className="text-text-tertiary mx-1">–</span>
                    <span className="text-negative">{h2h.biggestLoss.theirScore}</span>
                  </div>
                  <div className="text-[9px] text-negative font-bold">–{h2h.biggestLoss.theirScore - h2h.biggestLoss.myScore} pts margin</div>
                </div>
              </div>
            )}

            {h2h.closest && (
              <div className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.15em] text-text-tertiary mb-0.5">Closest Match</div>
                  <div className="text-[12px] font-bold">Matchday {h2h.closest.matchday}</div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] font-black tabular-nums">
                    <span className="text-white">{h2h.closest.myScore}</span>
                    <span className="text-text-tertiary mx-1">–</span>
                    <span className="text-white">{h2h.closest.theirScore}</span>
                  </div>
                  <div className="text-[9px] text-text-tertiary font-bold">
                    {h2h.closest.myScore === h2h.closest.theirScore ? 'Draw — 0 pts gap' : `${Math.abs(h2h.closest.myScore - h2h.closest.theirScore)} pts gap`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom padding */}
          <div className="h-8" />
        </div>
    </BottomSheet>
  );
}
