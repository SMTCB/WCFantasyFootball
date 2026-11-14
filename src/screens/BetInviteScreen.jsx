/**
 * BetInviteScreen — public page behind a bet invite link (/bet/:betId).
 * Shows the bet and who sent it before login. One tap accepts: signed-out
 * visitors go through /auth and come back here to finish (?go=1).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import BrandMark from '../components/BrandMark';

export default function BetInviteScreen() {
  const { betId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [bet, setBet] = useState(undefined); // undefined = loading, null = not available
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoTried = useRef(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_bet_invite_preview', { p_bet_id: betId }).then(({ data, error: err }) => {
      if (alive) setBet(err ? null : (data ?? null));
    });
    return () => { alive = false; };
  }, [betId]);

  const accept = async () => {
    setBusy(true); setError('');
    const { data, error: err } = await supabase.rpc('accept_bet_invite', { p_bet_id: betId });
    setBusy(false);
    if (err || data?.error) { setError('This bet is no longer open.'); return; }
    navigate(`/clubhouse/${data.circle_id}`, { replace: true });
  };

  const onAccept = () => {
    if (user) { accept(); return; }
    navigate(`/auth?redirect=${encodeURIComponent(`/bet/${betId}?go=1`)}`);
  };

  // Back from sign-in/sign-up: finish the accept automatically.
  useEffect(() => {
    if (autoTried.current || authLoading || !user || !bet || searchParams.get('go') !== '1') return;
    autoTried.current = true;
    accept();
  }, [authLoading, user, bet]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BrandMark theme="light" scale={1} />
        {bet === undefined && <div style={{ color: 'var(--mute)' }}>Loading the bet…</div>}
        {bet === null && (
          <>
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>This bet is no longer open.</div>
            <button onClick={() => navigate('/')} style={{ minHeight: 'var(--tap)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', background: 'transparent', color: 'var(--text2)' }}>Go to Clubhouse</button>
          </>
        )}
        {bet && (
          <>
            <div style={{ color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>
              {bet.sender ?? 'A friend'} invited you to a bet in {bet.clubhouse}
            </div>
            <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 'var(--fs-body)', lineHeight: 1.4 }}>{bet.question}</div>
            <div style={{ color: 'var(--text2)', fontSize: 'var(--fs-label)' }}>
              {bet.stake_coins} coins to take it
              {bet.ends_at ? ` · closes ${new Date(bet.ends_at).toLocaleString()}` : ''}
            </div>
            {error && <div role="alert" style={{ color: 'var(--neg)', fontSize: 'var(--fs-label)' }}>{error}</div>}
            <button
              onClick={onAccept} disabled={busy}
              style={{ minHeight: 'var(--tap)', borderRadius: 'var(--radius)', border: '1.5px solid var(--gold)', background: 'transparent', color: 'var(--gold-text)', fontWeight: 600, opacity: busy ? 0.6 : 1 }}
            >{user ? 'Join the Clubhouse and see the bet' : 'Sign in or create an account to take it'}</button>
          </>
        )}
      </div>
    </div>
  );
}
