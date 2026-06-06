import { useState, useEffect } from 'react';
import { useKnockoutKeep } from '../hooks/useKnockoutKeep';

const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";
const BODY    = "'Archivo', sans-serif";

const POS_COLOR = { GK: '#f59e0b', DEF: '#22c55e', MID: '#00b4d8', FWD: '#f03a3a', FW: '#f03a3a' };

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Knockout Keep Selector banner.
 *
 * Shown on SquadScreen only when:
 *   cup + draft league  AND  cup_phase === 'group_stage'  AND  knockout_draft_deadline is set
 *
 * The cup_phase guard (enforced by both this component and the submit RPC) prevents
 * any keep UI from appearing during the group-stage draft selection period.
 */
export default function KnockoutKeepSelector({ leagueId }) {
  const {
    shouldShow, players, existingKeeps, maxSlots,
    knockoutDeadline, eliminatedClubs, submit, loading, saving, error,
  } = useKnockoutKeep(leagueId);

  const [expanded,  setExpanded]  = useState(false);
  const [selected,  setSelected]  = useState(new Set());
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Initialise toggle state from existing submission when data loads
  useEffect(() => {
    if (existingKeeps.length > 0) setSelected(new Set(existingKeeps));
  }, [existingKeeps]);

  if (loading || !shouldShow) return null;

  const togglePlayer = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < maxSlots) {
        next.add(id);
      }
      return next;
    });
    setSaved(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaveError(null);
    const result = await submit([...selected]);
    if (result.ok) {
      setSaved(true);
    } else {
      setSaveError(result.error);
    }
  };

  const isDirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...existingKeeps].sort());

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(160,108,255,0.05)' }}>

      {/* ── Collapsed banner ─────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ width: 3, height: 14, background: 'var(--purple, #a855f7)', flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.22em' }}>
          KNOCKOUT KEEP WINDOW
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', flex: 1 }}>
          · Select up to {maxSlots} players to protect · Draft {fmt(knockoutDeadline)}
        </span>

        {/* Status chip */}
        {existingKeeps.length > 0 && !isDirty ? (
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.14em',
            padding: '2px 8px', border: '1px solid rgba(24,201,107,0.4)', color: 'var(--positive)',
            background: 'rgba(24,201,107,0.08)', flexShrink: 0,
          }}>
            {existingKeeps.length} PROTECTED ✓
          </span>
        ) : (
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '.14em',
            padding: '2px 8px', border: '1px solid rgba(160,108,255,0.4)', color: '#a855f7',
            background: 'rgba(160,108,255,0.08)', flexShrink: 0,
          }}>
            {selected.size}/{maxSlots} SELECTED
          </span>
        )}

        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* ── Expanded panel ───────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: '0 20px 16px' }}>

          {/* Instruction */}
          <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Protected players carry into your knockout squad without going through the lottery.
            Other managers cannot draft them. Choose up to <strong style={{ color: 'var(--paper)' }}>{maxSlots}</strong>.
            You can revise this list until the commissioner runs the knockout allocation.
          </p>

          {/* Player grid */}
          {players.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>
              No squad data available.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {players.map(p => {
                const isKept      = selected.has(p.id);
                const isEliminated = eliminatedClubs.has(p.forza_team_id);
                const isDisabled  = isEliminated || (!isKept && selected.size >= maxSlots);
                const posColor    = POS_COLOR[p.position] ?? 'var(--mute)';

                return (
                  <button
                    key={p.id}
                    onClick={() => !isDisabled && togglePlayer(p.id)}
                    disabled={isDisabled}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px',
                      background: isKept
                        ? 'rgba(160,108,255,0.12)'
                        : isEliminated
                          ? 'rgba(255,255,255,0.02)'
                          : 'rgba(255,255,255,0.03)',
                      border: isKept
                        ? '1px solid rgba(160,108,255,0.45)'
                        : '1px solid rgba(255,255,255,0.07)',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isEliminated ? 0.4 : 1,
                      borderRadius: 4,
                      textAlign: 'left',
                    }}
                  >
                    {/* Shield toggle */}
                    <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, opacity: isKept ? 1 : 0.25 }}>
                      🛡️
                    </span>

                    {/* Position badge */}
                    <span style={{
                      fontFamily: MONO, fontSize: 8, fontWeight: 800,
                      letterSpacing: '.14em', padding: '1px 5px', flexShrink: 0,
                      border: `1px solid ${posColor}44`, color: posColor, background: `${posColor}12`,
                    }}>
                      {p.position === 'FW' ? 'FWD' : p.position}
                    </span>

                    {/* Name */}
                    <span style={{ fontFamily: BODY, fontSize: 12, color: isKept ? 'var(--paper)' : 'var(--mute)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>

                    {/* Club */}
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em', flexShrink: 0 }}>
                      {isEliminated ? '✕ ELIMINATED' : (p.club ?? '')}
                    </span>

                    {/* Price */}
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--gold)', flexShrink: 0 }}>
                      £{Number(p.price ?? 0).toFixed(1)}m
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em', flex: 1 }}>
              {selected.size} / {maxSlots} selected
            </span>

            {saveError && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.1em', flex: 1 }}>
                {saveError}
              </span>
            )}

            {saved && !isDirty && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--positive)', letterSpacing: '.14em' }}>
                Saved ✓
              </span>
            )}

            <button
              onClick={() => { setSelected(new Set()); setSaved(false); setSaveError(null); }}
              disabled={selected.size === 0 || saving}
              style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '.14em',
                padding: '6px 12px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)', color: 'var(--mute)',
                cursor: selected.size === 0 || saving ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.4 : 1,
              }}
            >
              CLEAR
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              style={{
                fontFamily: DISPLAY, fontSize: 10, letterSpacing: '.14em',
                padding: '7px 18px',
                background: isDirty ? 'var(--purple, #a855f7)' : 'rgba(160,108,255,0.2)',
                border: 'none',
                color: isDirty ? 'white' : 'rgba(160,108,255,0.6)',
                cursor: saving || !isDirty ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'SAVING…' : 'SAVE KEEPS'}
            </button>
          </div>

          {error && (
            <p style={{ fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.1em', margin: '8px 0 0' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
