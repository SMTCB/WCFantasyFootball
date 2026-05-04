/**
 * LeagueInviteCard — shareable invite card shown after league creation.
 *
 * Features:
 *   - Displays join code in large, copyable format
 *   - "Copy code" button with "Copied!" flash feedback
 *   - WhatsApp share (wa.me deep link)
 *   - "Copy invite link" for any other platform
 *   - html2canvas export as PNG (share as image)
 *
 * Props:
 *   league   { id, name, format, join_code }
 *   onDone   () => void  — called when user clicks "Go to my league"
 */

import { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabase';

const BASE_URL = window.location.origin;

export default function LeagueInviteCard({ league, onDone }) {
  const [copied,       setCopied]       = useState(false);
  const [linkCopied,   setLinkCopied]   = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [tournamentName, setTournamentName] = useState('Fantasy Football');
  const cardRef = useRef(null);

  // Load tournament name if league has a tournament_id
  useEffect(() => {
    const loadTournament = async () => {
      if (league.tournament_id) {
        try {
          const { data } = await supabase
            .from('tournaments')
            .select('name')
            .eq('id', league.tournament_id)
            .single();
          if (data) setTournamentName(data.name);
        } catch (err) {
          console.error('Failed to load tournament name', err);
        }
      }
    };
    loadTournament();
  }, [league.tournament_id]);

  const joinUrl     = `${BASE_URL}/join?code=${league.join_code}`;
  const waMessage   = encodeURIComponent(
    `🏆 Join my ForzaKit ${tournamentName} fantasy league!\n\nLeague: ${league.name}\nJoin code: ${league.join_code}\n\nSign up & enter the code at: ${joinUrl}`
  );
  const waUrl = `https://wa.me/?text=${waMessage}`;

  const copyCode = async () => {
    await navigator.clipboard.writeText(league.join_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const exportImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0D1117',
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${league.name.replace(/\s+/g, '-')}-invite.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{
      minHeight:      '100dvh',
      background:     '#070A0F',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '24px',
    }}>
      {/* Ambient grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(24,201,107,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(24,201,107,0.03) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>

        {/* ── Visual card (exported as PNG) ─────────────────────────── */}
        <div
          ref={cardRef}
          style={{
            background:   'linear-gradient(135deg, #0D1117 0%, #111820 100%)',
            border:       '1px solid rgba(24,201,107,0.25)',
            borderRadius: '16px',
            padding:      '36px 32px 32px',
            marginBottom: '20px',
            boxShadow:    '0 0 60px rgba(24,201,107,0.08), 0 24px 64px rgba(0,0,0,0.6)',
            position:     'relative',
            overflow:     'hidden',
          }}
        >
          {/* Decorative corner accent */}
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: '120px', height: '120px',
            background: 'radial-gradient(circle at top right, rgba(24,201,107,0.12), transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Trophy + brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
            <span style={{ fontSize: '28px' }}>🏆</span>
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.18em', color: '#18C96B', textTransform: 'uppercase', fontWeight: 800 }}>
                ForzaKit · {tournamentName}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(240,242,245,0.4)', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.08em' }}>
                Fantasy Football
              </div>
            </div>
          </div>

          {/* League created */}
          <div style={{ fontSize: '11px', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.14em', color: '#18C96B', textTransform: 'uppercase', marginBottom: '6px' }}>
            League created ✓
          </div>
          <div style={{
            fontSize: 'clamp(24px, 7vw, 34px)',
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 900,
            textTransform: 'uppercase',
            color: '#F0F2F5',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            marginBottom: '28px',
          }}>
            {league.name}
          </div>

          {/* Join code */}
          <div style={{ marginBottom: '8px', fontSize: '10px', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.15em', color: 'rgba(240,242,245,0.4)', textTransform: 'uppercase' }}>
            Join Code
          </div>
          <button
            onClick={copyCode}
            title="Click to copy"
            style={{
              width:          '100%',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '16px 20px',
              background:     'rgba(24,201,107,0.07)',
              border:         '1px solid rgba(24,201,107,0.3)',
              borderRadius:   '10px',
              cursor:         'pointer',
              transition:     'background 0.2s',
              marginBottom:   '6px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(24,201,107,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(24,201,107,0.07)'}
          >
            <span style={{
              fontSize:     '36px',
              fontFamily:   'Barlow Condensed, sans-serif',
              fontWeight:   900,
              letterSpacing: '0.18em',
              color:        '#18C96B',
              lineHeight:   1,
            }}>
              {league.join_code}
            </span>
            <span style={{ fontSize: '18px', opacity: 0.6 }}>
              {copied ? '✓' : '📋'}
            </span>
          </button>
          <div style={{ fontSize: '11px', color: 'rgba(240,242,245,0.3)', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.05em', textAlign: 'center' }}>
            {copied ? '✓ Copied!' : 'Tap code to copy'}
          </div>

          {/* Format badge */}
          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              fontSize: '9px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: '4px',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(240,242,245,0.4)',
            }}>
              {league.format === 'noduplicate' ? 'Draft' : 'Classic'} format
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(240,242,245,0.25)', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.08em' }}>
              · Up to 10 managers
            </div>
          </div>
        </div>

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* WhatsApp */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '10px',
              padding:        '14px',
              background:     '#25D366',
              borderRadius:   '10px',
              color:          '#fff',
              fontSize:       '13px',
              fontFamily:     'Barlow Condensed, sans-serif',
              fontWeight:     800,
              letterSpacing:  '0.08em',
              textTransform:  'uppercase',
              textDecoration: 'none',
              transition:     'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <span style={{ fontSize: '18px' }}>💬</span>
            Share on WhatsApp
          </a>

          {/* Copy link + Export row */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={copyLink}
              style={{
                flex:          1,
                padding:       '12px',
                background:    'rgba(255,255,255,0.06)',
                border:        '1px solid rgba(255,255,255,0.10)',
                borderRadius:  '10px',
                color:         linkCopied ? '#18C96B' : 'rgba(240,242,245,0.7)',
                fontSize:      '12px',
                fontFamily:    'Barlow Condensed, sans-serif',
                fontWeight:    700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                cursor:        'pointer',
                transition:    'all 0.15s',
              }}
            >
              {linkCopied ? '✓ Copied!' : '🔗 Copy Link'}
            </button>

            <button
              onClick={exportImage}
              disabled={exporting}
              style={{
                flex:          1,
                padding:       '12px',
                background:    'rgba(255,255,255,0.06)',
                border:        '1px solid rgba(255,255,255,0.10)',
                borderRadius:  '10px',
                color:         'rgba(240,242,245,0.7)',
                fontSize:      '12px',
                fontFamily:    'Barlow Condensed, sans-serif',
                fontWeight:    700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                cursor:        exporting ? 'wait' : 'pointer',
                opacity:       exporting ? 0.6 : 1,
                transition:    'all 0.15s',
              }}
            >
              {exporting ? 'Saving…' : '🖼️ Save Card'}
            </button>
          </div>

          {/* Go to league */}
          <button
            onClick={onDone}
            style={{
              padding:        '14px',
              background:     'transparent',
              border:         '1px solid rgba(255,255,255,0.10)',
              borderRadius:   '10px',
              color:          'rgba(240,242,245,0.45)',
              fontSize:       '12px',
              fontFamily:     'Barlow Condensed, sans-serif',
              fontWeight:     700,
              letterSpacing:  '0.08em',
              textTransform:  'uppercase',
              cursor:         'pointer',
              transition:     'color 0.15s',
              marginTop:      '4px',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#F0F2F5'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(240,242,245,0.45)'}
          >
            Go to my league →
          </button>
        </div>
      </div>
    </div>
  );
}
