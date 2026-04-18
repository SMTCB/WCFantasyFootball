import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import RecapCard from '../components/RecapCard';


import { supabase } from '../lib/supabase';

export default function RecapScreen() {
  const [recap,   setRecap]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied]   = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    fetchRecap();
  }, []);

  const fetchRecap = async () => {
    try {
      setLoading(true);
      const userId = '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase
        .from('matchday_recaps')
        .select(`
          *,
          bestPlayer:best_player_id(name, position),
          captain:captain_id(name, position),
          joker:joker_player_id(name, position)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        // Flatten the Supabase response for the UI
        setRecap({
          matchday: data.matchday_id,
          leagueName: 'World Cup Legends', // In real app, join with leagues
          username: 'João', 
          rank: data.final_rank,
          points: data.final_points,
          rankChange: data.rank_change,
          bestPlayer: { ...data.bestPlayer, points: 15 }, // Points would eventually come from fantasy_points
          captain:    { ...data.captain,    points: 10 },
          joker:      data.joker ? { ...data.joker, points: 5 } : null,
          transfersMade: data.transfers_made,
          date: new Date(data.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        });
      }
    } catch (err) {
      console.error('Recap fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  const { rankLabel, rankChangeColor, rankChangeText } = useMemo(() => {
    if (!recap) return { rankLabel: '', rankChangeColor: '', rankChangeText: '' };
    
    const label = recap.rank === 1 ? '1st' : recap.rank === 2 ? '2nd' : recap.rank === 3 ? '3rd' : `${recap.rank}th`;
    const color = recap.rankChange > 0 ? 'text-positive' : recap.rankChange < 0 ? 'text-negative' : 'text-text-tertiary';
    const text  = recap.rankChange > 0
      ? `↑ ${recap.rankChange} place${recap.rankChange > 1 ? 's' : ''}`
      : recap.rankChange < 0
      ? `↓ ${Math.abs(recap.rankChange)} place${Math.abs(recap.rankChange) > 1 ? 's' : ''}`
      : '— Same position';
      
    return { rankLabel: label, rankChangeColor: color, rankChangeText: text };
  }, [recap]);

  // ── Image Generation ───────────────────────────────────────────────────────
  const generateImage = async () => {
    if (!cardRef.current) return null;
    setSharing(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: '#0D0D0D',
        useCORS: true,
        logging: false,
      });
      return canvas.toDataURL('image/png');
    } finally {
      setSharing(false);
    }
  };

  // ── Share Handlers ─────────────────────────────────────────────────────────
  const handleSaveImage = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `fantasykit-matchday-${recap.matchday}-recap.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleShareNative = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file  = new File([blob], `fantasykit-md${recap.matchday}.png`, { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `FantasyKit — Matchday ${recap.matchday} Recap`,
          text: `I scored ${recap.points} pts and finished ${rankLabel} in Matchday ${recap.matchday}! 🏆`,
        });
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    } else {
      // Fallback: copy text link
      try {
        await navigator.clipboard.writeText(`I scored ${recap.points} pts in Matchday ${recap.matchday} of FantasyKit! Rank: ${rankLabel} in ${recap.leagueName}.`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {}
    }
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-xs font-bold text-text-tertiary">GENREATING RECAP...</div>;
  if (!recap) return <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
    <div className="text-4xl mb-4">🏆</div>
    <div className="text-lg font-black uppercase">No Recaps Yet</div>
    <div className="text-xs text-text-tertiary mt-2">Finish a matchday to see your performance summary!</div>
    <Link to="/" className="mt-8 text-positive text-xs font-black uppercase tracking-widest border border-positive/30 px-6 py-3 rounded-sm">Back to Home</Link>
  </div>;

  return (
    <div className="min-h-screen bg-bg">
      <div className="min-h-screen flex flex-col">

        {/* Header */}
        <div className="bg-[#161616] py-3 px-4 border-b border-white/5 sticky top-0 z-40 flex items-center justify-between">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary">{recap.leagueName}</div>
            <h1 className="text-sm font-black uppercase tracking-wide">Matchday {recap.matchday} Recap</h1>
          </div>
          <div className="text-[10px] text-text-tertiary font-semibold">{recap.date}</div>
        </div>

        {/* ── Hero Rank Block ─────────────────────────────── */}
        <div className="flex flex-col items-center justify-center py-10 px-4 border-b border-white/5 bg-[#0a0a0a] text-center">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-2">Final Rank</div>
          <div className="text-8xl font-black leading-none tracking-tighter">{rankLabel}</div>
          <div className="text-2xl font-black text-positive mt-4 tracking-tight">{recap.points} pts</div>
          <div className={`text-sm font-bold mt-2 ${rankChangeColor}`}>{rankChangeText}</div>
        </div>

        {/* ── Stat Rows ────────────────────────────────────── */}
        <div className="divide-y divide-white/5">

          {/* Best Player */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[11px] font-black text-white/30 uppercase">
                {recap.bestPlayer.name.substring(0, 2)}
              </div>
              <div>
                <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em]">Best Player</div>
                <div className="text-[14px] font-bold">{recap.bestPlayer.name}</div>
              </div>
            </div>
            <div className="bg-white text-black text-[11px] font-black px-2.5 py-1 rounded-[3px]">
              {recap.bestPlayer.points} pts
            </div>
          </div>

          {/* Captain */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-yellow-950/40 border border-yellow-500 flex items-center justify-center text-[11px] font-black text-yellow-400">
                C
              </div>
              <div>
                <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em]">Captain</div>
                <div className="text-[14px] font-bold">{recap.captain.name}</div>
              </div>
            </div>
            <div className="bg-yellow-500 text-black text-[11px] font-black px-2.5 py-1 rounded-[3px]">
              ×2 = {recap.captain.points * 2} pts
            </div>
          </div>

          {/* Joker (conditional) */}
          {recap.joker && (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-950/40 border border-purple-500 flex items-center justify-center text-[16px]">
                  🃏
                </div>
                <div>
                  <div className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.15em]">Joker Played</div>
                  <div className="text-[14px] font-bold">{recap.joker.name}</div>
                </div>
              </div>
              <div className="bg-purple-600 text-white text-[11px] font-black px-2.5 py-1 rounded-[3px]">
                {recap.joker.points} pts
              </div>
            </div>
          )}

          {/* Transfers */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="text-[11px] text-text-tertiary font-black uppercase tracking-[0.15em]">Transfers Made</div>
            <div className="text-[14px] font-bold tabular-nums">{recap.transfersMade}</div>
          </div>
        </div>

        {/* ── Share Actions ─────────────────────────────────── */}
        <div className="p-4 mt-auto">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary text-center mb-4">
            Share your recap
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShareNative}
              disabled={sharing}
              className="col-span-2 py-4 bg-positive text-black font-black text-sm uppercase tracking-widest rounded-sm active:scale-98 transition-all disabled:opacity-50 shadow-[0_4px_20px_rgba(34,197,94,0.3)]"
            >
              {sharing ? '⏳ Generating...' : copied ? '✅ Copied!' : '📱 Share Recap'}
            </button>

            <button
              onClick={handleSaveImage}
              disabled={sharing}
              className="py-3.5 bg-[#161616] border border-white/10 text-white font-bold text-sm uppercase tracking-wider rounded-sm hover:bg-[#1e1e1e] transition-colors disabled:opacity-50"
            >
              💾 Save Image
            </button>

            <button
              onClick={async () => {
                const text = `I scored ${recap.points} pts and finished ${rankLabel} in Matchday ${recap.matchday} of FantasyKit! 🏆 Playing in ${recap.leagueName}.`;
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
              className="py-3.5 bg-[#161616] border border-white/10 text-white font-bold text-sm uppercase tracking-wider rounded-sm hover:bg-[#1e1e1e] transition-colors"
            >
              {copied ? '✅ Copied!' : '📋 Copy Text'}
            </button>
          </div>
        </div>

        {/* ── Off-screen Shareable Card (used by html2canvas) ─ */}
        <div className="absolute -left-[9999px] top-0 opacity-0 pointer-events-none" aria-hidden="true">
          <RecapCard recap={recap} forwardRef={cardRef} />
        </div>

      </div>
    </div>
  );
}
