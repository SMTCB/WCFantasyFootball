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
  const [draftSubmissions, setDraftSubmissions] = useState([]); // each manager's full originally-submitted priority list
  const [players,   setPlayers]   = useState({});   // id → name lookup
  const [members,   setMembers]   = useState({});   // id → username lookup
  const [expanded,  setExpanded]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    const fetchReports = async () => {
      try {
        const [{ data: draftRow }, { data: wishlistRows }, { data: submissionRows }] = await Promise.all([
          supabase
            .from('gazette_entries')
            .select('*')
            .eq('league_id', leagueId)
            .eq('entry_type', 'draft_report')
            .order('published_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          // No .limit() here — every resolved round must stay visible for the
          // life of the league, not just the most recent ones, so this reads
          // as permanent audit history rather than a rotating news feed.
          supabase
            .from('gazette_entries')
            .select('*')
            .eq('league_id', leagueId)
            .eq('entry_type', 'wishlist_draft_report')
            .order('published_at', { ascending: false }),
          // Each manager's complete originally-submitted priority list for the
          // season draft — the audit trail's "point 1": what they asked for,
          // not just what they ended up with.
          supabase
            .from('draft_submissions')
            .select('user_id, player_ids')
            .eq('league_id', leagueId),
        ]);
        if (cancelled) return;

        setDraftEntry(draftRow ?? null);
        setWishlistEntries(wishlistRows ?? []);
        setDraftSubmissions(submissionRows ?? []);

        if (!draftRow && !(wishlistRows?.length) && !(submissionRows?.length)) return;

        const draftBullets  = draftRow ? parseJson(draftRow.bullets, []) : [];
        const draftFullData = draftRow ? parseJson(draftRow.full_data, null) : null;
        const wishlistFullDatas = (wishlistRows ?? [])
          .map(row => parseJson(row.full_data, null))
          .filter(Boolean);
        const wishlistSubmissions = wishlistFullDatas.flatMap(fd => fd.submissions ?? []);

        const playerIds = [
          ...draftBullets.filter(b => b.player_id).map(b => b.player_id),
          ...(draftFullData?.pick_log ?? []).map(p => p.player_id),
          ...wishlistFullDatas.flatMap(fd => fd.pick_log ?? []).map(p => p.player_id),
          ...wishlistFullDatas.flatMap(fd => fd.formation_safety_net ?? []).map(a => a.player_id),
          ...(submissionRows ?? []).flatMap(s => s.player_ids ?? []),
          ...wishlistSubmissions.flatMap(s => [...(s.target_ids ?? []), ...(s.drop_ids ?? [])]),
        ];
        const userIds   = [
          ...draftBullets.filter(b => b.winner_id).map(b => b.winner_id),
          ...(draftFullData?.allocations ?? []).map(a => a.user_id),
          ...(draftFullData?.pick_log ?? []).map(p => p.user_id),
          ...(wishlistRows ?? []).flatMap(row => parseJson(row.bullets, []).map(b => b.user_id)).filter(Boolean),
          ...wishlistFullDatas.flatMap(fd => fd.pick_log ?? []).map(p => p.user_id),
          ...wishlistFullDatas.flatMap(fd => fd.formation_safety_net ?? []).map(a => a.user_id),
          ...(submissionRows ?? []).map(s => s.user_id),
          ...wishlistSubmissions.map(s => s.user_id),
        ];

        const [{ data: pRows }, { data: uRows }] = await Promise.all([
          playerIds.length
            ? supabase.from('players').select('id, name, club').in('id', [...new Set(playerIds)])
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

  if (loading || (!draftEntry && wishlistEntries.length === 0 && draftSubmissions.length === 0)) return null;

  return (
    <div className="border-t-2 border-black/20 pt-6 mt-6">
      {draftEntry && (
        <SeasonDraftReport
          entry={draftEntry}
          submissions={draftSubmissions}
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
              <WishlistRoundReport key={entry.id} entry={entry} members={members} players={players} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeasonDraftReport({ entry, submissions, players, members, expanded, setExpanded }) {
  const bullets  = parseJson(entry.bullets, []);
  const fullData = parseJson(entry.full_data, null);
  const date     = new Date(entry.published_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const [pickLogExpanded, setPickLogExpanded] = useState(false);
  const [listsExpanded, setListsExpanded] = useState(false);
  const hasPickLog = fullData?.pick_log?.length > 0;

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
        hasPickLog
          ? <DraftOrderList snakeOrder={fullData.snake_order} members={members} />
          : <DraftOrderBoard snakeOrder={fullData.snake_order} members={members} />
      )}

      {hasPickLog && (
        <DraftPickLogTable
          pickLog={fullData.pick_log}
          members={members}
          players={players}
          expanded={pickLogExpanded}
          setExpanded={setPickLogExpanded}
        />
      )}

      {submissions?.length > 0 && (
        <InitialListsTable
          submissions={submissions}
          members={members}
          players={players}
          pickLog={fullData?.pick_log}
          expanded={listsExpanded}
          setExpanded={setListsExpanded}
        />
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

// Compact companion to DraftPickLogTable: just the round-1 lottery order,
// since the full round-by-round direction/detail lives in the log below.
function DraftOrderList({
  snakeOrder,
  members,
  title = 'Draft Order — Round 1 (set by lottery)',
  note = 'Round 2 reverses this order, round 3 restores it, and so on — see the full log below for exactly who picked what, and when.',
}) {
  return (
    <div className="mb-4 border border-black/10 rounded p-3">
      <div className="text-[9px] font-black uppercase tracking-widest text-black/40 mb-2">
        {title}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-black/60">
        {snakeOrder.map((uid, i) => (
          <span key={uid}>
            <span className="font-black text-black/40">{i + 1}.</span> {members[uid] ?? 'Manager'}
          </span>
        ))}
      </div>
      <p className="text-[9px] text-black/40 italic mt-2">
        {note}
      </p>
    </div>
  );
}

// The actual audit trail: every pick, in the order it happened, grouped by
// round. wishlist_rank shows how far down that manager's own list the pick
// came from — the answer to "why didn't I get my top picks" is usually
// "someone with an earlier turn that round took them first" (visible via
// order_index) or "they were gone by the time your turn came" (visible via
// the wishlist_rank gap between consecutive picks).
function DraftPickLogTable({ pickLog, members, players, expanded, setExpanded, title = 'Round-by-Round Draft Log', firstRoundLabel = 'lottery order' }) {
  const totalRounds = pickLog.length ? Math.max(...pickLog.map(p => p.round)) : 0;
  const byRound = {};
  for (const p of pickLog) (byRound[p.round] ??= []).push(p);
  for (const round of Object.values(byRound)) round.sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-[10px] font-black uppercase tracking-widest text-black/50 underline underline-offset-2 mb-3 flex items-center gap-1"
      >
        {title} {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div className="border border-black/10 rounded overflow-hidden text-[10px] max-h-[480px] overflow-y-auto">
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
            const picks = byRound[round] ?? [];
            const reversed = round % 2 === 0;
            return (
              <div key={round} className="border-b border-black/10 last:border-b-0">
                <div className="flex items-center justify-between bg-black text-white px-3 py-1.5 font-black uppercase tracking-widest sticky top-0">
                  <span>Round {round}</span>
                  <span className="opacity-60 font-normal normal-case">{reversed ? '← reversed order' : firstRoundLabel}</span>
                </div>
                {picks.map((p, i) => (
                  <div
                    key={`${round}-${p.order_index}`}
                    className={`grid grid-cols-[auto_1fr_1fr_auto] px-3 py-1.5 gap-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-black/5'}`}
                  >
                    <span className="font-black text-black/40 w-5 text-right shrink-0">{p.order_index}.</span>
                    <span className="font-bold text-[#1a1a1a] truncate">{members[p.user_id] ?? 'Manager'}</span>
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      <ClubCrest name={players[p.player_id]?.club} size={12} />
                      <span className="truncate">{players[p.player_id]?.name ?? p.player_id}</span>
                    </span>
                    <span className="text-black/40 text-right shrink-0" title="Position in this manager's own wishlist">
                      #{p.wishlist_rank}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WishlistRoundReport({ entry, members, players }) {
  const bullets  = parseJson(entry.bullets, []);
  const fullData = parseJson(entry.full_data, null);
  const date     = new Date(entry.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const [pickLogExpanded, setPickLogExpanded] = useState(false);
  const [listsExpanded, setListsExpanded] = useState(false);

  const order          = fullData?.order ?? [];
  const pickLog         = fullData?.pick_log ?? [];
  const submissions      = fullData?.submissions ?? [];
  const safetyNet       = fullData?.formation_safety_net ?? [];
  const hasPickLog       = pickLog.length > 0;
  const hasSubmissions    = submissions.length > 0;
  const hasSafetyNet     = safetyNet.length > 0;

  return (
    <div className="border border-black/10 rounded overflow-hidden text-[10px]">
      <div className="flex items-center justify-between bg-black text-white px-3 py-1.5">
        <span className="font-black uppercase tracking-widest">
          Round {fullData?.round_number ?? '—'}
        </span>
        <span className="opacity-60">{date}</span>
      </div>

      {order.length > 0 && (
        <div className="p-3">
          <DraftOrderList
            snakeOrder={order}
            members={members}
            title="Pick Order — This Round"
            note="This round's order is the league's base pick order rotated by one seat each round, so no manager sits in the same slot every time — see the log below for exactly who picked what."
          />
        </div>
      )}

      {hasPickLog && (
        <div className="px-3">
          <DraftPickLogTable
            pickLog={pickLog}
            members={members}
            players={players}
            expanded={pickLogExpanded}
            setExpanded={setPickLogExpanded}
            title="Round-by-Round Pick Log"
            firstRoundLabel="this round's order"
          />
        </div>
      )}

      {hasSubmissions && (
        <div className="px-3">
          <WishlistListsTable
            submissions={submissions}
            members={members}
            players={players}
            pickLog={pickLog}
            expanded={listsExpanded}
            setExpanded={setListsExpanded}
          />
        </div>
      )}

      {hasSafetyNet && (
        <div className="mx-3 mb-3 border border-amber-600/30 bg-amber-50 rounded p-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-800 mb-1">
            ⚠ Formation Safety Net
          </div>
          <p className="text-[9px] text-amber-900/80 italic mb-1.5">
            One or more managers' wishlists would have left their squad short of a fielding-legal formation. The system auto-corrected it — full swap below.
          </p>
          <ul className="space-y-0.5">
            {safetyNet.map((a, i) => (
              <li key={i} className="flex gap-1.5 text-amber-900">
                <span className="font-bold">{members[a.user_id] ?? 'Manager'}</span>
                <span className="opacity-70">{a.direction === 'released' ? 'released' : 'gained'}</span>
                <span className="inline-flex items-center gap-1">
                  <ClubCrest name={players?.[a.player_id]?.club} size={12} />
                  {players?.[a.player_id]?.name ?? a.player_id}
                </span>
                <span className="opacity-50">({a.position})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

// The other half of the audit trail: not just what each manager ended up
// with, but what they actually asked for — their full ranked priority list
// as originally submitted before the lottery. Cross-referenced against the
// pick log so each entry reads as won (they got it), lost (someone else's
// earlier turn took it), or still open (never reached / no contest).
function InitialListsTable({ submissions, members, players, pickLog, expanded, setExpanded }) {
  if (!submissions?.length) return null;

  const pickByPlayer = {};
  for (const p of (pickLog ?? [])) pickByPlayer[p.player_id] = p;

  const sorted = [...submissions].sort((a, b) =>
    (members[a.user_id] ?? '').localeCompare(members[b.user_id] ?? '')
  );

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-[10px] font-black uppercase tracking-widest text-black/50 underline underline-offset-2 mb-3 flex items-center gap-1"
      >
        Initial Priority Lists — As Submitted {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div className="border border-black/10 rounded overflow-hidden text-[10px] max-h-[480px] overflow-y-auto">
          {sorted.map((sub, si) => {
            const ids = sub.player_ids ?? [];
            if (!ids.length) return null;
            return (
              <div key={sub.user_id ?? si} className="border-b border-black/10 last:border-b-0">
                <div className="flex items-center justify-between bg-black text-white px-3 py-1.5 font-black uppercase tracking-widest sticky top-0">
                  <span>{members[sub.user_id] ?? 'Manager'}</span>
                  <span className="opacity-60 font-normal normal-case">{ids.length} ranked</span>
                </div>
                {ids.map((pid, i) => {
                  const pick = pickByPlayer[pid];
                  const won  = pick && pick.user_id === sub.user_id;
                  const lost = pick && pick.user_id !== sub.user_id;
                  return (
                    <div
                      key={`${sub.user_id}-${pid}-${i}`}
                      className={`grid grid-cols-[auto_1fr_auto] px-3 py-1 gap-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-black/5'}`}
                    >
                      <span className="font-black text-black/40 w-6 text-right shrink-0">{i + 1}.</span>
                      <span className={`inline-flex items-center gap-1.5 truncate min-w-0 ${lost ? 'line-through opacity-50' : ''}`}>
                        <ClubCrest name={players[pid]?.club} size={12} />
                        <span className="truncate">{players[pid]?.name ?? pid}</span>
                      </span>
                      <span className={`text-right shrink-0 text-[9px] font-bold ${won ? 'text-green-700' : lost ? 'text-red-600' : 'text-black/30'}`}>
                        {won ? '✓ won' : lost ? `→ ${members[pick.user_id] ?? 'other'}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Wishlist-round counterpart: each manager's full submitted target list
// (players wanted, ranked) and drop list (players offered up), not just the
// requested/released/gained tallies shown in the summary table above.
function WishlistListsTable({ submissions, members, players, pickLog, expanded, setExpanded }) {
  if (!submissions?.length) return null;

  const pickByPlayer = {};
  for (const p of (pickLog ?? [])) pickByPlayer[p.player_id] = p;

  const sorted = [...submissions].sort((a, b) =>
    (members[a.user_id] ?? '').localeCompare(members[b.user_id] ?? '')
  );

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-[10px] font-black uppercase tracking-widest text-black/50 underline underline-offset-2 mb-3 flex items-center gap-1"
      >
        Manager Wishlists — Full Submissions {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div className="border border-black/10 rounded overflow-hidden text-[10px] max-h-[480px] overflow-y-auto">
          {sorted.map((sub, si) => {
            const targets = sub.target_ids ?? [];
            const drops   = sub.drop_ids ?? [];
            if (!targets.length && !drops.length) return null;
            return (
              <div key={sub.user_id ?? si} className="border-b border-black/10 last:border-b-0">
                <div className="flex items-center justify-between bg-black text-white px-3 py-1.5 font-black uppercase tracking-widest sticky top-0">
                  <span>{members[sub.user_id] ?? 'Manager'}</span>
                  <span className="opacity-60 font-normal normal-case">
                    {targets.length} target{targets.length !== 1 ? 's' : ''} · {drops.length} drop{drops.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {targets.map((pid, i) => {
                  const pick = pickByPlayer[pid];
                  const won  = pick && pick.user_id === sub.user_id;
                  const lost = pick && pick.user_id !== sub.user_id;
                  return (
                    <div
                      key={`t-${sub.user_id}-${pid}-${i}`}
                      className={`grid grid-cols-[auto_auto_1fr_auto] px-3 py-1 gap-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-black/5'}`}
                    >
                      <span className="font-black text-black/40 w-6 text-right shrink-0">{i + 1}.</span>
                      <span className="text-[8px] font-black uppercase tracking-widest text-cyan-700 w-10 shrink-0">Target</span>
                      <span className={`inline-flex items-center gap-1.5 truncate min-w-0 ${lost ? 'line-through opacity-50' : ''}`}>
                        <ClubCrest name={players[pid]?.club} size={12} />
                        <span className="truncate">{players[pid]?.name ?? pid}</span>
                      </span>
                      <span className={`text-right shrink-0 text-[9px] font-bold ${won ? 'text-green-700' : lost ? 'text-red-600' : 'text-black/30'}`}>
                        {won ? '✓ gained' : lost ? `→ ${members[pick.user_id] ?? 'other'}` : '—'}
                      </span>
                    </div>
                  );
                })}
                {drops.map((pid, i) => (
                  <div
                    key={`d-${sub.user_id}-${pid}-${i}`}
                    className={`grid grid-cols-[auto_auto_1fr_auto] px-3 py-1 gap-3 items-center ${(targets.length + i) % 2 === 0 ? 'bg-white' : 'bg-black/5'}`}
                  >
                    <span className="w-6 shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-red-700 w-10 shrink-0">Drop</span>
                    <span className="inline-flex items-center gap-1.5 truncate min-w-0">
                      <ClubCrest name={players[pid]?.club} size={12} />
                      <span className="truncate">{players[pid]?.name ?? pid}</span>
                    </span>
                    <span className="text-right shrink-0 text-[9px] text-black/30">offered</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw; // jsonb already comes back parsed
  try { return JSON.parse(raw); } catch { return fallback; }
}
