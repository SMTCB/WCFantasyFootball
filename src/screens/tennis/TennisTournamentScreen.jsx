import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTennisTournament } from '../../hooks/tennis/useTennisTournament';

const TIER_LABEL = { 1: 'Seeds 1–4', 2: 'Seeds 5–16', 3: 'Seeds 17–32', 4: 'Unseeded' };
const TIER_SLOTS = [
  { tier: 1, keys: ['tier1'],          label: 'Tier 1',  slots: 1 },
  { tier: 2, keys: ['tier2a','tier2b'], label: 'Tier 2', slots: 2 },
  { tier: 3, keys: ['tier3a','tier3b'], label: 'Tier 3', slots: 2 },
  { tier: 4, keys: ['tier4a','tier4b'], label: 'Tier 4 — Dark Horses', slots: 2 },
];
const ACE_CARD_INFO = {
  underdog_boost:        { icon: '🚀', label: 'Underdog Boost',       desc: 'Double all points from your 2 Dark Horse (Tier 4) players.' },
  safety_net:            { icon: '🛡️', label: 'Safety Net',           desc: '+200 pts consolation if your Tier 1 pick exits in round 1 or 2.' },
  surface_specialist:    { icon: '⚡', label: 'Surface Specialist',   desc: 'Double your entire 7-player roster total for this tournament.' },
  dark_horse_insurance:  { icon: '🎯', label: 'Dark Horse Insurance', desc: '+50 pts per round your unseeded picks advance past the Round of 32.' },
};
const ROUND_LABEL = { r128: 'R128', r64: 'R64', r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', runner_up: 'Runner-up', champion: '🏆 Champion' };

export default function TennisTournamentScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    tournament, players, roster, captain, aceCards, survivingPlayers, score,
    loading, error, submitRoster, setQfCaptain,
  } = useTennisTournament(id);

  const [slots, setSlots] = useState({});
  const [selectedAce, setSelectedAce] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [captainBusy, setCaptainBusy] = useState(false);

  if (loading) return <Loader />;
  if (error) return <ErrorMsg msg={error} onBack={() => navigate('/tennis')} />;
  if (!tournament) return <ErrorMsg msg="Tournament not found." onBack={() => navigate('/tennis')} />;

  const isRosterOpen = tournament.status === 'roster_open';
  const isQfOpen = tournament.status === 'qf_captain_open';
  const isCompleted = tournament.status === 'completed';
  const isAtp = tournament.tournament_type === 'atp_finals';

  const availableAceCards = aceCards.filter(c => !c.used_tournament_id);
  const usedCard = aceCards.find(c => c.used_tournament_id === id);

  const rosterSlots = roster ? {
    tier1: roster.tier1_player_id,
    tier2a: roster.tier2a_player_id,
    tier2b: roster.tier2b_player_id,
    tier3a: roster.tier3a_player_id,
    tier3b: roster.tier3b_player_id,
    tier4a: roster.tier4a_player_id,
    tier4b: roster.tier4b_player_id,
  } : slots;

  const activeSlots = roster ? rosterSlots : slots;
  const selectedIds = new Set(Object.values(activeSlots).filter(Boolean));

  async function handleSubmit(e) {
    e.preventDefault();
    const needed = ['tier1','tier2a','tier2b','tier3a','tier3b','tier4a','tier4b'];
    if (needed.some(k => !slots[k])) { setSubmitErr('Select a player for each slot.'); return; }
    setBusy(true); setSubmitErr('');
    try {
      await submitRoster(slots, selectedAce);
    } catch (e) {
      setSubmitErr(e.message);
    } finally { setBusy(false); }
  }

  async function handleCaptain(playerId) {
    setCaptainBusy(true);
    try {
      await setQfCaptain(playerId);
    } catch (e) {
      setSubmitErr(e.message);
    } finally { setCaptainBusy(false); }
  }

  const tierPlayers = (tier) => players.filter(p => p.tier === tier);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 16px' }}>
        <button onClick={() => navigate('/tennis')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: 'Archivo, sans-serif', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          ← Back
        </button>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>
          {tournament.tournament_type === 'grand_slam' ? 'Grand Slam' : tournament.tournament_type === 'atp_finals' ? 'ATP Finals' : 'Masters 1000'} · {tournament.surface}
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 24, color: '#fff', margin: '0 0 4px' }}>
          {tournament.name}
        </h1>
        <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {new Date(tournament.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(tournament.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>

        {/* Score card (completed) */}
        {isCompleted && score && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
              Your Score
            </div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 36, color: 'var(--accent)' }}>
              {score.total_points.toLocaleString()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 10 }}>
              <ScorePill label="Base" val={score.base_points} />
              {score.ace_card_bonus > 0 && <ScorePill label="Ace Card" val={`+${score.ace_card_bonus}`} accent />}
              {score.captain_bonus > 0 && <ScorePill label="Captain ×2" val={`+${score.captain_bonus}`} gold />}
            </div>
          </div>
        )}

        {/* QF Captain picker */}
        {isQfOpen && !isAtp && (
          <div style={{ background: 'var(--card)', border: `2px solid var(--gold)`, borderRadius: 6, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 15, color: 'var(--paper)', marginBottom: 4 }}>
              ⚡ QF Captain Window Open
            </div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>
              Select one of your surviving players as captain. They earn 2× points for the rest of the tournament.
            </p>
            {captain && (
              <div style={{ background: 'var(--elev)', borderRadius: 6, padding: '10px 12px', marginBottom: 12, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)' }}>
                Current captain: <strong>{players.find(p => p.id === captain.captain_player_id)?.player_name ?? '—'}</strong>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {survivingPlayers.map(p => (
                <button
                  key={p.id}
                  disabled={captainBusy}
                  onClick={() => handleCaptain(p.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', border: `1px solid ${captain?.captain_player_id === p.id ? 'var(--gold)' : 'var(--rule)'}`,
                    borderRadius: 6, background: captain?.captain_player_id === p.id ? 'rgba(184,114,14,0.08)' : 'var(--card)',
                    cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)',
                  }}
                >
                  <span>{p.player_name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {TIER_LABEL[p.tier]} {captain?.captain_player_id === p.id ? '· ⭐ Captain' : ''}
                  </span>
                </button>
              ))}
            </div>
            {submitErr && <div style={{ marginTop: 10, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--neg)' }}>{submitErr}</div>}
          </div>
        )}

        {/* Existing roster display */}
        {roster && !isRosterOpen && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 12 }}>
              Your Squad
            </div>
            {TIER_SLOTS.map(({ tier, keys, label }) => (
              <div key={tier} style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                  {label} — {TIER_LABEL[tier]}
                </div>
                {keys.map(k => {
                  const pid = rosterSlots[k];
                  const p = players.find(pl => pl.id === pid);
                  if (!p) return null;
                  return (
                    <RosterRow key={k} player={p} captain={captain} isCaptain={captain?.captain_player_id === p.id} />
                  );
                })}
              </div>
            ))}
            {usedCard && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--elev)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--text-2)' }}>
                {ACE_CARD_INFO[usedCard.card_type]?.icon} Ace Card played: <strong>{ACE_CARD_INFO[usedCard.card_type]?.label}</strong>
              </div>
            )}
          </div>
        )}

        {/* Roster picker form */}
        {isRosterOpen && !isAtp && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px' }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 16 }}>
                Pick your 7-player squad
              </div>
              {TIER_SLOTS.map(({ tier, keys, label }) => (
                <div key={tier} style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                    {label} — {TIER_LABEL[tier]} ({keys.length} pick{keys.length > 1 ? 's' : ''})
                  </div>
                  {keys.map(slotKey => (
                    <div key={slotKey} style={{ marginBottom: 8 }}>
                      <select
                        value={slots[slotKey] ?? ''}
                        onChange={e => setSlots(prev => ({ ...prev, [slotKey]: e.target.value || null }))}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, color: slots[slotKey] ? 'var(--paper)' : 'var(--mute)', background: 'var(--card)', outline: 'none' }}
                      >
                        <option value="">Select player…</option>
                        {tierPlayers(tier).map(p => (
                          <option key={p.id} value={p.id} disabled={selectedIds.has(p.id) && slots[slotKey] !== p.id}>
                            {p.player_name}{p.seed ? ` [${p.seed}]` : ''}{p.nationality ? ` · ${p.nationality}` : ''}{selectedIds.has(p.id) && slots[slotKey] !== p.id ? ' (picked)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Ace Card selector */}
            {availableAceCards.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px' }}>
                <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 4 }}>
                  Ace Card (optional)
                </div>
                <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)', margin: '0 0 12px' }}>
                  Play at most one card per tournament. Each type can only be used once per season.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedAce(null)}
                    style={{ padding: '10px 14px', border: `1px solid ${!selectedAce ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 6, background: !selectedAce ? 'var(--accent-bg)' : 'var(--card)', textAlign: 'left', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--text-2)' }}
                  >
                    No card this tournament
                  </button>
                  {availableAceCards.map(c => {
                    const info = ACE_CARD_INFO[c.card_type] ?? {};
                    return (
                      <button
                        key={c.card_type}
                        type="button"
                        onClick={() => setSelectedAce(c.card_type)}
                        style={{ padding: '10px 14px', border: `1px solid ${selectedAce === c.card_type ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 6, background: selectedAce === c.card_type ? 'var(--accent-bg)' : 'var(--card)', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--paper)', marginBottom: 2 }}>
                          {info.icon} {info.label}
                        </div>
                        <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)' }}>{info.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {submitErr && <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--neg)' }}>{submitErr}</div>}
            <button
              type="submit"
              disabled={busy}
              style={{ padding: '13px', background: busy ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Locking squad…' : roster ? 'Update squad →' : 'Lock squad →'}
            </button>
          </form>
        )}

        {/* Upcoming / not-open state */}
        {tournament.status === 'upcoming' && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Roster not yet open
            </div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--mute)', margin: '10px 0 0' }}>
              The player list hasn't been seeded yet. Check back closer to the tournament start.
            </p>
          </div>
        )}

        {/* In progress (no QF window) */}
        {tournament.status === 'in_progress' && !isQfOpen && roster && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Tournament in progress
            </div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--mute)', margin: '8px 0 0' }}>
              Your squad is locked. The QF captain window will open when 8 players remain.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RosterRow({ player, isCaptain }) {
  const tierColor = { 1: 'var(--gold)', 2: 'var(--accent)', 3: 'var(--text-2)', 4: 'var(--neg)' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: tierColor[player.tier] ?? 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 16 }}>
        T{player.tier}
      </span>
      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', flex: 1, fontWeight: 500 }}>
        {player.player_name} {isCaptain && '⭐'}
      </span>
      {player.eliminated ? (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {ROUND_LABEL[player.round_reached] ?? player.round_reached}
        </span>
      ) : (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--pos)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Still in
        </span>
      )}
    </div>
  );
}

function ScorePill({ label, val, accent, gold }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: gold ? 'var(--gold)' : accent ? 'var(--accent)' : 'var(--paper)' }}>{val}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
    </div>
  );
}

function Loader() {
  return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)' }}>Loading…</div>;
}

function ErrorMsg({ msg, onBack }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 24 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 14, padding: 0, marginBottom: 16 }}>← Back</button>
      <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--neg)' }}>{msg}</div>
    </div>
  );
}
