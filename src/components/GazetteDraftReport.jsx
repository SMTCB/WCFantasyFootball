import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Renders the most recent draft_report gazette entry for a league.
// Designed to slot into the frontpage view without disrupting the
// existing newspaper aesthetic.

export default function GazetteDraftReport({ leagueId }) {
  const [entry,     setEntry]     = useState(null);
  const [players,   setPlayers]   = useState({});   // id → name lookup
  const [members,   setMembers]   = useState({});   // id → username lookup
  const [expanded,  setExpanded]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!leagueId) return;

    const fetchReport = async () => {
      try {
        const { data: entryData } = await supabase
          .from('gazette_entries')
          .select('*')
          .eq('league_id', leagueId)
          .eq('entry_type', 'draft_report')
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!entryData) return;
        setEntry(entryData);

        const bullets  = parseBullets(entryData.bullets);
        const fullData = parseFullData(entryData.full_data);

        const playerIds = bullets.filter(b => b.player_id).map(b => b.player_id);
        const userIds   = [
          ...bullets.filter(b => b.winner_id).map(b => b.winner_id),
          ...(fullData?.allocations ?? []).map(a => a.user_id),
        ];

        const [{ data: pRows }, { data: uRows }] = await Promise.all([
          playerIds.length
            ? supabase.from('players').select('id, name').in('id', playerIds)
            : Promise.resolve({ data: [] }),
          userIds.length
            ? supabase.from('users').select('id, username').in('id', [...new Set(userIds)])
            : Promise.resolve({ data: [] }),
        ]);

        setPlayers(Object.fromEntries((pRows ?? []).map(p => [p.id, p.name])));
        setMembers(Object.fromEntries((uRows ?? []).map(u => [u.id, u.username])));
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [leagueId]);

  if (loading || !entry) return null;

  const bullets  = parseBullets(entry.bullets);
  const fullData = parseFullData(entry.full_data);
  const date     = new Date(entry.published_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="border-t-2 border-black/20 pt-6 mt-6">
      {/* Section label */}
      <div className="text-[9px] font-black uppercase tracking-widest text-black/40 mb-2">
        Draft Edition — {date}
      </div>

      {/* Headline */}
      <h2 className="font-serif text-2xl font-black leading-tight tracking-tight mb-4 text-[#1a1a1a]">
        {entry.headline}
      </h2>

      {/* Bullets */}
      {bullets.length > 0 && (
        <ul className="space-y-2 mb-4">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-[#1a1a1a]">
              <span className="text-black/30 font-black shrink-0">•</span>
              {b.text ? (
                <span className="italic opacity-70">{b.text}</span>
              ) : (
                <span>
                  <span className="font-bold">{players[b.player_id] ?? b.player_id}</span>
                  <span className="opacity-60"> — wanted by {b.wanted_by} manager{b.wanted_by > 1 ? 's' : ''} — goes to </span>
                  <span className="font-bold">{members[b.winner_id] ?? 'Unknown'}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Collapsible full results table */}
      {fullData?.allocations?.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] font-black uppercase tracking-widest text-black/50 underline underline-offset-2 mb-3 flex items-center gap-1"
          >
            Full Draft Results {expanded ? '▲' : '▼'}
          </button>

          {expanded && (
            <div className="border border-black/10 rounded overflow-hidden text-[10px]">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto] bg-black text-white px-3 py-1.5 font-black uppercase tracking-widest gap-4">
                <span>Manager</span>
                <span className="text-right">Players</span>
                <span className="text-right">Gaps</span>
              </div>
              {/* Rows */}
              {fullData.allocations.map((row, i) => (
                <div
                  key={row.user_id}
                  className={`grid grid-cols-[1fr_auto_auto] px-3 py-2 gap-4 items-start ${
                    i % 2 === 0 ? 'bg-white' : 'bg-black/5'
                  }`}
                >
                  <span className="font-bold text-[#1a1a1a]">
                    {members[row.user_id] ?? 'Manager'}
                  </span>
                  <span className="text-right text-black/60">
                    {row.players?.length ?? 0}/15
                  </span>
                  <span className={`text-right font-bold ${row.gaps > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {row.gaps > 0 ? `${row.gaps} missing` : '✓'}
                  </span>
                </div>
              ))}
              {/* Footer */}
              <div className="px-3 py-1.5 bg-black/5 text-black/40 italic text-[9px] border-t border-black/10">
                {fullData.total_managers} managers · {fullData.contested_count} contested player{fullData.contested_count !== 1 ? 's' : ''} resolved by lottery
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseBullets(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function parseFullData(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
