import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Renders the draft audit trail for a league: the most recent season-draft
// report (entry_type='draft_report') plus every wishlist-draft round report
// (entry_type='wishlist_draft_report', one per resolved round) — designed to
// slot into the frontpage/market-report view without disrupting the existing
// newspaper aesthetic.

export default function GazetteDraftReport({ leagueId }) {
  const [draftEntry,    setDraftEntry]    = useState(null);
  const [wishlistEntries, setWishlistEntries] = useState([]);
  const [players,   setPlayers]   = useState({});   // id → name lookup
  const [members,   setMembers]   = useState({});   // id → username lookup
  const [expanded,  setExpanded]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    const fetchReports = async () => {
      try {
        const [{ data: draftRow }, { data: wishlistRows }] = await Promise.all([
          supabase
            .from('gazette_entries')
            .select('*')
            .eq('league_id', leagueId)
            .eq('entry_type', 'draft_report')
            .order('published_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('gazette_entries')
            .select('*')
            .eq('league_id', leagueId)
            .eq('entry_type', 'wishlist_draft_report')
            .order('published_at', { ascending: false })
            .limit(12),
        ]);
        if (cancelled) return;

        setDraftEntry(draftRow ?? null);
        setWishlistEntries(wishlistRows ?? []);

        if (!draftRow && !(wishlistRows?.length)) return;

        const draftBullets  = draftRow ? parseJson(draftRow.bullets, []) : [];
        const draftFullData = draftRow ? parseJson(draftRow.full_data, null) : null;

        const playerIds = draftBullets.filter(b => b.player_id).map(b => b.player_id);
        const userIds   = [
          ...draftBullets.filter(b => b.winner_id).map(b => b.winner_id),
          ...(draftFullData?.allocations ?? []).map(a => a.user_id),
          ...(wishlistRows ?? []).flatMap(row => parseJson(row.bullets, []).map(b => b.user_id)).filter(Boolean),
        ];

        const [{ data: pRows }, { data: uRows }] = await Promise.all([
          playerIds.length
            ? supabase.from('players').select('id, name').in('id', playerIds)
            : Promise.resolve({ data: [] }),
          userIds.length
            ? supabase.from('users').select('id, username').in('id', [...new Set(userIds)])
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;

        setPlayers(Object.fromEntries((pRows ?? []).map(p => [p.id, p.name])));
        setMembers(Object.fromEntries((uRows ?? []).map(u => [u.id, u.username])));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReports();
    return () => { cancelled = true; };
  }, [leagueId]);

  if (loading || (!draftEntry && wishlistEntries.length === 0)) return null;

  return (
    <div className="border-t-2 border-black/20 pt-6 mt-6">
      {draftEntry && (
        <SeasonDraftReport
          entry={draftEntry}
          players={players}
          members={members}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
      {wishlistEntries.length > 0 && (
        <div className={draftEntry ? 'mt-6' : ''}>
          <div className="text-[9px] font-black uppercase tracking-widest text-black/40 mb-2">
            Wishlist Draft Rounds
          </div>
          <div className="space-y-3">
            {wishlistEntries.map(entry => (
              <WishlistRoundReport key={entry.id} entry={entry} members={members} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeasonDraftReport({ entry, players, members, expanded, setExpanded }) {
  const bullets  = parseJson(entry.bullets, []);
  const fullData = parseJson(entry.full_data, null);
  const date     = new Date(entry.published_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-black/40 mb-2">
        Draft Edition — {date}
      </div>

      <h2 className="font-serif text-2xl font-black leading-tight tracking-tight mb-4 text-[#1a1a1a]">
        {entry.headline}
      </h2>

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
              <div className="grid grid-cols-[1fr_auto_auto] bg-black text-white px-3 py-1.5 font-black uppercase tracking-widest gap-4">
                <span>Manager</span>
                <span className="text-right">Players</span>
                <span className="text-right">Gaps</span>
              </div>
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
              <div className="px-3 py-1.5 bg-black/5 text-black/40 italic text-[9px] border-t border-black/10">
                {fullData.total_managers} managers · {fullData.contested_count ?? 0} contested player{fullData.contested_count !== 1 ? 's' : ''} resolved by lottery
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WishlistRoundReport({ entry, members }) {
  const bullets  = parseJson(entry.bullets, []);
  const fullData = parseJson(entry.full_data, null);
  const date     = new Date(entry.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <div className="border border-black/10 rounded overflow-hidden text-[10px]">
      <div className="flex items-center justify-between bg-black text-white px-3 py-1.5">
        <span className="font-black uppercase tracking-widest">
          Round {fullData?.round_number ?? '—'}
        </span>
        <span className="opacity-60">{date}</span>
      </div>
      {bullets.length > 0 ? (
        <div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] bg-black/5 text-black/50 px-3 py-1 font-black uppercase tracking-widest gap-3">
            <span>Manager</span>
            <span className="text-right">Wanted</span>
            <span className="text-right">Released</span>
            <span className="text-right">Gained</span>
          </div>
          {bullets.map((b, i) => (
            <div
              key={b.user_id ?? i}
              className={`grid grid-cols-[1fr_auto_auto_auto] px-3 py-2 gap-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-black/5'}`}
            >
              <span className="font-bold text-[#1a1a1a]">{members[b.user_id] ?? 'Manager'}</span>
              <span className="text-right text-black/60">{b.requested ?? 0}</span>
              <span className="text-right text-black/60">{b.released ?? 0}</span>
              <span className={`text-right font-bold ${b.gained > 0 ? 'text-green-700' : 'text-black/40'}`}>
                {b.gained > 0 ? `+${b.gained}` : b.gained ?? 0}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-black/40 italic">No participants this round.</div>
      )}
    </div>
  );
}

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw; // jsonb already comes back parsed
  try { return JSON.parse(raw); } catch { return fallback; }
}
