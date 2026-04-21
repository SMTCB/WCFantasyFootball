import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// ─── Mock player pool with "predicted goals" for smart sorting ──────────────
const MOCK_PLAYERS = [
  { id: 'p9',  name: 'Mbappé',       club: 'FRA', position: 'FWD', predictedGoals: 1.8, flag: '🇫🇷' },
  { id: 'p11', name: 'Vinicius Jr.', club: 'BRA', position: 'FWD', predictedGoals: 1.5, flag: '🇧🇷' },
  { id: 'p6',  name: 'Bellingham',   club: 'ENG', position: 'MID', predictedGoals: 0.9, flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'p8',  name: 'De Bruyne',    club: 'BEL', position: 'MID', predictedGoals: 0.8, flag: '🇧🇪' },
  { id: 'p7',  name: 'Pedri',        club: 'ESP', position: 'MID', predictedGoals: 0.6, flag: '🇪🇸' },
  { id: 'p2',  name: 'Hakimi',       club: 'MAR', position: 'DEF', predictedGoals: 0.4, flag: '🇲🇦' },
  { id: 'p3',  name: 'Rúben Dias',   club: 'POR', position: 'DEF', predictedGoals: 0.3, flag: '🇵🇹' },
  { id: 'p1',  name: 'Alisson',      club: 'BRA', position: 'GK',  predictedGoals: 0.1, flag: '🇧🇷' },
];

export default function PredictionModal({ matchday, deadlineLabel, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() =>
    MOCK_PLAYERS.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.club.toLowerCase().includes(search.toLowerCase())
    ), [search]
  );

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('top_scorer_predictions')
        .upsert({
          user_id: user.id,
          matchday_id: String(matchday),
          predicted_player_id: selected.id,
        }, { onConflict: 'user_id,matchday_id' });

      onSave(selected);
    } catch (err) {
      console.error('Prediction save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-[#111] border-t border-white/10 rounded-t-2xl pb-safe shadow-2xl">
        
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-1">
                🎯 Daily Prediction · Matchday {matchday}
              </div>
              <h2 className="text-[15px] font-black uppercase tracking-tight">
                Who'll be top scorer?
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-text-tertiary hover:text-white transition-colors text-lg"
            >
              ×
            </button>
          </div>
          <div className="text-[10px] text-text-tertiary mt-1.5">
            ⏰ Deadline: {deadlineLabel} &nbsp;·&nbsp; Correct pick = +5 pts
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-white/5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-sm pl-9 pr-4 py-2.5 text-[13px] text-white placeholder:text-text-tertiary focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>
        </div>

        {/* Player List */}
        <div className="overflow-y-auto max-h-[40vh]">
          {filtered.map((player, i) => {
            const isSelected = selected?.id === player.id;
            return (
              <button
                key={player.id}
                onClick={() => setSelected(isSelected ? null : player)}
                className={`w-full flex items-center justify-between px-5 py-3.5 border-b border-white/5 transition-colors text-left ${
                  isSelected
                    ? 'bg-white/10 border-l-2 border-l-white'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <span className="text-[10px] font-black text-text-tertiary w-4 tabular-nums">{i + 1}</span>

                  {/* Flag + Initials */}
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-[11px] font-black text-white/30 uppercase">
                      {player.name.substring(0, 2)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 text-[10px]">{player.flag}</div>
                  </div>

                  {/* Name + position */}
                  <div>
                    <div className={`text-[13px] font-bold leading-tight ${isSelected ? 'text-white' : ''}`}>
                      {player.name}
                    </div>
                    <div className="text-[10px] text-text-tertiary uppercase font-semibold tracking-wider">
                      {player.club} · {player.position}
                    </div>
                  </div>
                </div>

                {/* Predicted goals */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-[12px] font-black tabular-nums">{player.predictedGoals.toFixed(1)}</div>
                    <div className="text-[9px] text-text-tertiary uppercase tracking-wider">pred. goals</div>
                  </div>
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-black text-[10px] font-black">✓</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div className="p-4 pt-3">
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="w-full py-4 bg-white text-black text-[13px] font-black uppercase tracking-widest rounded-sm disabled:opacity-30 active:scale-[0.98] transition-all"
          >
            {saving ? 'Saving...' : selected ? `Pick ${selected.name}` : 'Select a player'}
          </button>
        </div>
      </div>
    </>
  );
}
