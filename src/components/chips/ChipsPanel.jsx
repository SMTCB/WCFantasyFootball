import { useEffect, useState } from 'react';
import { useChips } from '../../hooks/useChips';
import { CHIPS, roundLabel } from '../../lib/chips';
import Button from '../Button';
import JokerPickerSheet from './JokerPickerSheet';

function useCountdown(deadlineAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (!deadlineAt) return null;
  const ms = new Date(deadlineAt).getTime() - now;
  if (ms <= 0) return { text: 'Locked', urgent: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const d = Math.floor(h / 24);
  const text = d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return { text, urgent: ms <= 2 * 3600000 };
}

const STATE_COPY = {
  active:   { pill: 'ACTIVE' },
  used:     { pill: 'USED' },
  locked:   { pill: 'LOCKED' },
  blocked:  { pill: 'BLOCKED' },
  available:{ pill: 'AVAILABLE' },
};

function ChipCard({ chip, info, busy, hasCaptain, onActivate, onDeactivate, onPickJoker }) {
  const status = info?.status ?? 'locked';
  const active = status === 'active';
  const dim    = status === 'used' || status === 'locked' || status === 'blocked';
  const pill   = STATE_COPY[status]?.pill ?? '';
  const usedIn = status === 'used' ? roundLabel(info?.matchday_id) : '';

  let note = null;
  if (status === 'locked')  note = 'No open round right now.';
  if (status === 'blocked') note = 'Another captain chip is already active this round.';
  if (status === 'used')    note = usedIn ? `Played in ${usedIn}.` : 'Already played this tournament.';
  if (active)               note = 'Locks at the round deadline — you can still switch it off until then.';
  if (chip.id === 'triple_captain' && status === 'available' && !hasCaptain) note = 'Set a captain first — the ×3 applies to them.';

  return (
    <section
      aria-label={`${chip.name} — ${status}`}
      style={{
        background: active ? `color-mix(in srgb, ${chip.tone} 8%, var(--card))` : 'var(--card)',
        border: `1px solid ${active ? chip.tone : 'var(--rule)'}`,
        borderLeft: `4px solid ${dim ? 'var(--rule)' : chip.tone}`,
        padding: '14px 16px', opacity: dim ? 0.78 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="fk-display shrink-0 flex items-center justify-center"
          style={{
            minWidth: 44, height: 44, padding: '0 6px',
            border: `1.5px solid ${dim ? 'var(--rule)' : chip.tone}`,
            color: dim ? 'var(--mute)' : chip.toneText,
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: chip.badge.length > 2 ? 'var(--fs-micro)' : 'var(--fs-heading)',
            letterSpacing: chip.badge.length > 2 ? '0.08em' : '-0.02em',
          }}
        >{chip.badge}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 style={{ margin: 0, fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', letterSpacing: '-0.01em' }}>
              {chip.name}
            </h3>
            <span
              className="fk-mono"
              style={{ fontSize: 'var(--fs-micro)', letterSpacing: '0.16em', color: active ? chip.toneText : 'var(--mute)' }}
            >
              {active && <span aria-hidden="true" className="animate-live-pulse" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: chip.tone, marginRight: 6 }} />}
              {pill}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--paper)', lineHeight: 1.4 }}>
            {chip.rule}
          </p>
          <p style={{ margin: '4px 0 0', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.4 }}>
            {chip.detail}
          </p>
        </div>
      </div>

      {chip.id === 'joker' && info?.player_name && (status === 'active' || status === 'used') && (
        <div
          className="fk-mono"
          style={{ marginTop: 10, padding: '8px 10px', background: 'var(--elev)', border: '1px solid var(--rule)', fontSize: 'var(--fs-label)', color: 'var(--paper)' }}
        >
          <span style={{ color: 'var(--mute)', letterSpacing: '0.14em' }}>PICK · </span>{info.player_name} <span style={{ color: chip.toneText }}>×2</span>
        </div>
      )}

      {note && (
        <p style={{ margin: '10px 0 0', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.4 }}>{note}</p>
      )}

      {(status === 'available' || active) && (
        <div className="flex gap-2" style={{ marginTop: 12 }}>
          {chip.id === 'joker' ? (
            <>
              <Button variant={active ? 'secondary' : 'gold'} size="md" onClick={onPickJoker} loading={busy} fullWidth>
                {active ? 'Change player' : 'Choose player'}
              </Button>
              {active && <Button variant="ghost" size="md" onClick={onDeactivate} disabled={busy}>Withdraw</Button>}
            </>
          ) : active ? (
            <Button variant="secondary" size="md" onClick={onDeactivate} loading={busy} fullWidth>Deactivate</Button>
          ) : (
            <Button variant="gold" size="md" onClick={onActivate} loading={busy} fullWidth>Activate for this round</Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * ChipsPanel — Squad "Chips" tab. Server is the source of truth (get_my_chips);
 * the panel only renders state and fires the activate / joker RPCs behind a ConfirmModal.
 */
export default function ChipsPanel({ leagueId, userId, tournamentId, ownedIds, hasCaptain, setConfirm, showToast }) {
  const { state, loading, error, busy, toggleChip, setJoker, clearJoker } = useChips(leagueId, userId);
  const [picking, setPicking] = useState(false);
  const countdown = useCountdown(state?.round?.deadline_at);

  const report = (res, okMsg) => {
    if (res.ok) showToast?.(okMsg, 'success');
    else showToast?.(res.error, 'error');
  };

  const chipMeta = (id) => CHIPS.find(c => c.id === id);

  const askToggle = (chipId, turningOn) => {
    const chip = chipMeta(chipId);
    const round = roundLabel(state?.round?.matchday_id);
    setConfirm({
      title: turningOn ? `Activate ${chip.name}?` : `Switch off ${chip.name}?`,
      body: turningOn
        ? `${chip.rule} It applies to ${round || 'this round'} and can only be used once this tournament.`
        : `${chip.name} goes back to your hand and can be played in a later round.`,
      confirmLabel: turningOn ? 'Activate' : 'Switch off',
      onConfirm: async () => report(await toggleChip(chipId), turningOn ? `${chip.name} activated` : `${chip.name} switched off`),
    });
  };

  const askJoker = (player) => {
    setPicking(false);
    setConfirm({
      title: `Play ${player.name} as your Joker?`,
      body: `Their points count ×2 for ${roundLabel(state?.round?.matchday_id) || 'this round'}. You can change or withdraw the pick until the deadline; once the deadline passes the Joker is spent for the tournament.`,
      confirmLabel: 'Play Joker',
      onConfirm: async () => report(await setJoker(player.id), `${player.name} locked in as your Joker`),
    });
  };

  const askWithdraw = () => setConfirm({
    title: 'Withdraw your Joker?',
    body: 'The Joker goes back to your hand and can be played in a later round.',
    confirmLabel: 'Withdraw',
    onConfirm: async () => report(await clearJoker(), 'Joker withdrawn'),
  });

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--mute)', fontSize: 'var(--fs-label)' }} role="status">Loading chips…</div>;
  }
  if (error || !state) {
    return <div style={{ padding: 24, color: 'var(--danger)', fontSize: 'var(--fs-label)' }} role="alert">{error ?? 'Chips are unavailable right now.'}</div>;
  }

  // Admin-disabled chips are hidden (the server reports 'disabled' only for chips never played,
  // so a chip the manager already used stays visible as history).
  const visible = CHIPS.filter(c => state.chips[c.id]?.status !== 'disabled');
  const hiddenCount = CHIPS.length - visible.length;

  return (
    <div className="px-4 py-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex items-center justify-between" style={{ paddingBottom: 4 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Chips</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-heading)', color: 'var(--paper)', letterSpacing: '-0.01em' }}>
            {state.round ? roundLabel(state.round.matchday_id) : 'No open round'}
          </div>
        </div>
        {countdown && (
          <div className="text-right">
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Deadline</div>
            <div className="fk-mono" style={{ fontSize: 'var(--fs-body)', color: countdown.urgent ? 'var(--danger)' : 'var(--paper)' }}>{countdown.text}</div>
          </div>
        )}
      </div>

      {visible.length === 0 && (
        <p style={{ color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>Your league admin has turned all chips off.</p>
      )}

      {visible.map(chip => (
        <ChipCard
          key={chip.id}
          chip={chip}
          info={state.chips[chip.id]}
          busy={busy === chip.id}
          hasCaptain={hasCaptain}
          onActivate={() => askToggle(chip.id, true)}
          onDeactivate={() => (chip.id === 'joker' ? askWithdraw() : askToggle(chip.id, false))}
          onPickJoker={() => setPicking(true)}
        />
      ))}

      {hiddenCount > 0 && (
        <p style={{ margin: 0, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
          {hiddenCount} chip{hiddenCount > 1 ? 's are' : ' is'} switched off by your league admin.
        </p>
      )}

      {picking && (
        <JokerPickerSheet tournamentId={tournamentId} ownedIds={ownedIds} onPick={askJoker} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
