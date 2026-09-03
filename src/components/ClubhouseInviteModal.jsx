/**
 * ClubhouseInviteModal — shareable invite for a Clubhouse (WhatsApp / link / code).
 *
 * Mirrors LeagueInviteCard's WhatsApp share pattern, but for a Clubhouse invite
 * code rather than a single league join code. The generated link lands on
 * /join-clubhouse?code=X (see JoinClubhouseRoute in App.jsx), which redirects
 * into /clubhouse?circleCode=X — ClubhouseScreen auto-joins on that param.
 *
 * Props:
 *   circle   { id, name, invite_code }
 *   onClose  () => void
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };

export default function ClubhouseInviteModal({ circle, onClose }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const cancelRef = useRef(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!circle?.invite_code) return null;

  const joinUrl = `${window.location.origin}/join-clubhouse?code=${circle.invite_code}`;
  const waMessage = encodeURIComponent(
    `🏠 Join my Clubhouse "${circle.name}" on Forza Fantasy League!\n\nInvite code: ${circle.invite_code}\n\nJoin here: ${joinUrl}`
  );
  const waUrl = `https://wa.me/?text=${waMessage}`;

  const copyCode = async () => {
    await navigator.clipboard.writeText(circle.invite_code).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(7,10,15,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380,
          background: 'var(--card)', border: '1px solid var(--rule)',
          borderRadius: 12, padding: '24px 22px 22px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 6 }}>
          Invite to your Clubhouse
        </div>
        <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--paper)', letterSpacing: '-0.01em', marginBottom: 18, overflowWrap: 'anywhere' }}>
          {circle.name}
        </div>

        {/* Invite code */}
        <div style={{ marginBottom: 6, ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', textTransform: 'uppercase' }}>
          Invite code
        </div>
        <button
          onClick={copyCode}
          title="Click to copy"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: 'rgba(24,201,107,0.07)', border: '1px solid rgba(24,201,107,0.3)',
            borderRadius: 10, cursor: 'pointer', marginBottom: 18,
          }}
        >
          <span style={{ ...HEAD, fontSize: 'var(--fs-title)', letterSpacing: '0.16em', color: 'var(--positive)' }}>
            {circle.invite_code}
          </span>
          <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: codeCopied ? 'var(--positive)' : 'var(--mute)' }}>
            {codeCopied ? '✓ Copied' : 'Tap to copy'}
          </span>
        </button>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: 14, background: '#25D366', borderRadius: 10, color: '#fff',
              fontSize: 'var(--fs-body)', ...HEAD, fontWeight: 800, letterSpacing: '0.06em',
              textTransform: 'uppercase', textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 'var(--fs-heading)' }}>💬</span>
            Share on WhatsApp
          </a>

          <button
            onClick={copyLink}
            style={{
              padding: 12, background: 'var(--elev)', border: '1px solid var(--rule)',
              borderRadius: 10, color: linkCopied ? 'var(--positive)' : 'var(--paper)',
              fontSize: 'var(--fs-label)', ...HEAD, fontWeight: 700, letterSpacing: '0.05em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {linkCopied ? '✓ Link copied' : '🔗 Copy invite link'}
          </button>

          <button
            ref={cancelRef}
            onClick={onClose}
            style={{
              padding: 12, background: 'transparent', border: '1px solid var(--rule)',
              borderRadius: 10, color: 'var(--mute)',
              fontSize: 'var(--fs-label)', ...HEAD, fontWeight: 700, letterSpacing: '0.05em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
