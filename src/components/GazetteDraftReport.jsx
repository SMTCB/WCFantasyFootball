import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ClubCrest from './ClubCrest';

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
            ? supabase.from('players').select('id, name, club').in('id', playerIds)
            : Promise.resolve({ data: [] }),
          userIds.length
            ? supabase.from('users').select('id, username').in('id', [...new Set(userIds)])
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;

        setPlayers(Object.fromEntries((pRows ?? []).map(p => [p.id, p])));
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

  // The backend orders contested-pick bullets purely by how many managers
  // wanted each player (most-contested first) — one manager's wins can end
  // up scattered throughout that list ahead of another manager's single
  // win, reading as if the same name keeps "jumping the queue". Regroup by
  // winning manager here so each manager's contested picks read together;
  // the wanted-by ranking is preserved within each manager's own group.
  const infoBullets = bullets.filter(b => b.text);
  const pickBullets = bullets.filter(b => !b.text && b.player_id);

  const picksByManager = {};
  for (const b of pickBullets) {
    const key = b.winner_id ?? 'unknown';
    (picksByManager[key] ??= []).push(b);
  }
  const managerGroups = Object.entries(picksByManager).sort(([aId], [bId]) =>
    (members[aId] ?? '').localeCompare(members[bId] ?? '')
  );

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-black/40 mb-2">
        Draft Edition — {date}
      </div>

      <h2 className="font-serif text-2xl font-black leading-tight tracking-tight mb-4 text-[#1a1a1a]">
        {entry.headline}
      </h2>

      {infoBullets.length > 0 && (
        <ul className="space-y-2 mb-4">
          {infoBullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-[#1a1a1a]">
              <span className="text-black/30 font-black shrink-0">•</span>
              <span className="italic opacity-70">{b.text}</span>
            </li>
          ))}
        </ul>
      )}

      {fullData?.snake_order?.length > 0 && (
        <DraftOrderBoard snakeOrder={fullData.snake_order} members={members} />
      )}

      {managerGroups.length > 0 && (
        <div className="space-y-3 mb-4">
          {managerGroups.map(([winnerId, picks]) => (
            <div key={winnerId}>
              <div className="text-[10px] font-black uppercase tracking-widest text-black/50 mb-1">
                {members[winnerId] ?? 'Unknown'}
                <span className="opacity-50 font-normal normal-case">
                  {' '}— {picks.length} contested pick{picks.length > 1 ? 's' : ''} won
                </span>
              </div>
              <ul className="space-y-1.5">
                {picks.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-[#1a1a1a] pl-1">
                    <span className="text-black/30 font-black shrink-0">•</span>
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <ClubCrest name={players[b.player_id]?.club} size={14} />
                      <span className="font-bold">{players[b.player_id]?.name ?? b.player_id}</span>
                      <span className="opacity-60"> — wanted by {b.wanted_by} manager{b.wanted_by > 1 ? 's' : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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

// Illustrates the snake-draft pick order set by the pre-draft lottery: the
// same rotation reverses every round, so no manager sits first every time.
// Shown alongside the contested-picks list to make the fairness of the
// mechanism itself visible, not just its outcome. Uses `snake_order` alone
// (already stored in every draft_report's full_data) — no pick-by-pick log
// exists server-side, so this shows the rotation pattern rather than a full
// pick-by-pick history.
function DraftOrderBoard({ snakeOrder, members }) {
  const n = snakeOrder.length;
  // Both rows walk `snakeOrder` in the SAME order so each manager lines up
  // in the same column across rounds — that alignment is what makes the
  // zigzag (reversed pick numbers, same columns) read as a snake pattern.
  const rows = [
    { label: 'Round 1', reversed: false },
    { label: 'Round 2', reversed: true },
  ];

  return (
    <div className="mb-4 border border-black/10 rounded p-3">
      <div className="text-[9px] font-black uppercase tracking-widest text-black/40 mb-1">
        Pick Order — Snake Draft
      </div>
      <p className="text-[10px] text-black/50 italic mb-3">
        Round 1 order was set by random lottery. Every round after reverses direction, so no manager always picks first.
      </p>

      <div className="space-y-2">
        {rows.map(({ label, reversed }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-black/40 w-14 shrink-0">
              {label}
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {snakeOrder.map((uid, i) => {
                const pickNumber = reversed ? n * 2 - i : i + 1;
                return (
                  <span key={uid + i} className="flex items-center" title={`Pick ${pickNumber} — ${members[uid] ?? 'Manager'}`}>
                    <span className="w-6 h-6 rounded-full bg-black text-white text-[9px] font-black flex items-center justify-center shrink-0">
                      {pickNumber}
                    </span>
                    {i < snakeOrder.length - 1 && (
                      <span className="text-black/20 text-[10px] px-0.5">{reversed ? '←' : '→'}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <div className="text-[9px] text-black/30 italic pl-16">
          …continues alternating every round until squads are full
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-black/10 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-black/60">
        {snakeOrder.map((uid, i) => (
          <span key={uid}>
            <span className="font-black text-black/40">{i + 1}.</span> {members[uid] ?? 'Manager'}
          </span>
        ))}
      </div>
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
