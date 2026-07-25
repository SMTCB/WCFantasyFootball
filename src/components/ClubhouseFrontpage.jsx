import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useClubhouseFrontpage, FT_EMOJIS } from '../hooks/useClubhouseFrontpage';
import { ReactionStrip, LettersPanel } from './league/FrontpageInteractive';

// Clubhouse Newspaper palette — intentional broadsheet design, NOT Kit Light tokens.
// FT_INK (#1A1A18) and FT_PAPER (#F2EEE5) are warm editorial colours that differ from
// the Kit Light --shell/--bg tokens by design: the newspaper sits inside a light-mode
// card but uses its own cream/dark-ink axis for the broadsheet feel.
// FT_SERIF uses var(--font-serif) — registered in src/index.css as the Clubhouse-only
// serif token (Georgia). All other surfaces use the 3-font system (display/body/mono).
const FT_INK    = '#1A1A18';   // intentional: warm dark ink (≠ --shell navy)
const FT_PAPER  = '#F2EEE5';   // intentional: warm cream broadsheet (≠ --bg)
const FT_CREAM  = '#EAE6DC';
const FT_RULE   = '#C8C4BA';
const FT_MUTE   = '#8A8680';
const FT_GOLD   = '#B5933A';
const FT_MONO   = 'JetBrains Mono, monospace';
const FT_SERIF  = 'var(--font-serif)';  // Georgia — registered token, Clubhouse-only
const FT_SLAB   = 'Archivo Black, Impact, sans-serif';
const FT_BODY   = 'Archivo, sans-serif';
const FT_SECTION_TEXT = '#4a4436';   // warm section-body tone, distinct from full-ink lead

const REGEN_COOLDOWN_MS = 4 * 60 * 60 * 1000;

// generated_at + 4h cooldown, ticking every 30s — used to show "next in Xh Ym" inline
// in the masthead instead of a separate bottom button, per the S-04 spec markup.
function useRegenCooldown(generatedAt) {
  const [label, setLabel] = useState(null);
  useEffect(() => {
    if (!generatedAt) { setLabel(null); return; }
    const nextAt = new Date(generatedAt).getTime() + REGEN_COOLDOWN_MS;
    function tick() {
      const remaining = nextAt - Date.now();
      if (remaining <= 0) { setLabel(null); return; }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      setLabel(`${h}h${String(m).padStart(2, '0')}m`);
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [generatedAt]);
  return label;
}

function FtSection({ label, content, sectionKey, ft }) {
  if (!content) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: FT_MONO, fontSize: 8, letterSpacing: '.2em', color: FT_MUTE, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <p style={{ fontFamily: FT_BODY, fontSize: 14, color: FT_SECTION_TEXT, lineHeight: 1.65, margin: '0 0 8px' }}>
        {content}
      </p>
      <ReactionStrip
        sectionKey={sectionKey}
        toggleReaction={ft.toggleReaction}
        getReactionCounts={ft.getReactionCounts}
        isMyReaction={ft.isMyReaction}
        EMOJIS={FT_EMOJIS}
        ftInk={FT_INK} ftRule={FT_RULE} ftMute={FT_MUTE} ftMono={FT_MONO}
      />
      <LettersPanel
        sectionKey={sectionKey}
        addComment={ft.addComment}
        getComments={ft.getComments}
        deleteComment={ft.deleteComment}
        members={[]}
        currentUserId={null}
        isCommissioner={false}
        ftInk={FT_INK} ftRule={FT_RULE} ftMute={FT_MUTE} ftMono={FT_MONO} ftSerif={FT_SERIF}
      />
    </div>
  );
}

function EditionView({ edition, ft, circleName, isOwner, onGenerate, generating, genError }) {
  const dateLabel = new Date(edition.edition_date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const cooldownLabel = useRegenCooldown(edition.generated_at);

  return (
    <div style={{ background: FT_PAPER, color: FT_INK, fontFamily: FT_BODY, padding: '24px 20px 32px' }}>

      {/* Masthead — single combined meta line with inline regenerate control, double-rule close */}
      <div style={{ textAlign: 'center', paddingBottom: 14, marginBottom: 18, borderBottom: `3px double ${FT_INK}` }}>
        <div style={{ fontFamily: FT_SERIF, fontWeight: 700, fontSize: 28, letterSpacing: '-0.01em', color: FT_INK, lineHeight: 1, marginBottom: 6 }}>
          FORZA TIMES
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontFamily: FT_MONO, fontSize: 8, letterSpacing: '.16em', color: FT_MUTE, textTransform: 'uppercase' }}>
          <span>EDITION #{edition.edition_number} · {dateLabel.toUpperCase()} · {circleName}</span>
          {isOwner && (
            cooldownLabel ? (
              <span>↻ Regenerate (owner · next in {cooldownLabel})</span>
            ) : (
              <button
                onClick={onGenerate}
                disabled={generating}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: FT_GOLD,
                  fontFamily: FT_MONO,
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  cursor: generating ? 'default' : 'pointer',
                  padding: 0,
                }}
              >
                {generating ? '↻ Generating…' : '↻ Regenerate (owner)'}
              </button>
            )
          )}
        </div>
        {genError && (
          <div style={{ fontFamily: FT_MONO, fontSize: 10, color: 'var(--danger)', marginTop: 8 }}>{genError}</div>
        )}
      </div>

      {/* Lead story */}
      {edition.headline && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: FT_SERIF, fontWeight: 700, fontSize: 22, lineHeight: 1.2, color: FT_INK, margin: '0 0 10px' }}>
            {edition.headline}
          </h2>
          {edition.deck && (
            <p style={{ fontFamily: FT_SERIF, fontSize: 14.5, lineHeight: 1.65, color: FT_INK, margin: '0 0 8px', fontStyle: 'italic' }}>
              {edition.deck}
            </p>
          )}
          <div style={{ fontFamily: FT_MONO, fontSize: 9, letterSpacing: '.14em', color: FT_MUTE, marginTop: 10 }}>
            By the Forza Times Desk
          </div>
          <ReactionStrip
            sectionKey="lead"
            toggleReaction={ft.toggleReaction}
            getReactionCounts={ft.getReactionCounts}
            isMyReaction={ft.isMyReaction}
            EMOJIS={FT_EMOJIS}
            ftInk={FT_INK} ftRule={FT_RULE} ftMute={FT_MUTE} ftMono={FT_MONO}
          />
          <LettersPanel
            sectionKey="lead"
            addComment={ft.addComment}
            getComments={ft.getComments}
            deleteComment={ft.deleteComment}
            members={[]}
            currentUserId={null}
            isCommissioner={false}
            ftInk={FT_INK} ftRule={FT_RULE} ftMute={FT_MUTE} ftMono={FT_MONO} ftSerif={FT_SERIF}
          />
        </div>
      )}

      {/* Hot Take / Wooden Spoon / Transfer Desk — 3-column grid on wide, stacked on narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, borderTop: `1px solid ${FT_RULE}`, paddingTop: 18 }}>
        {edition.hot_take && (
          <FtSection label="🔥 Hot Take" content={edition.hot_take} sectionKey="hot_take" ft={ft} />
        )}
        {edition.wooden_spoon && (
          <FtSection label="🥄 Wooden Spoon" content={edition.wooden_spoon} sectionKey="scores" ft={ft} />
        )}
        {edition.transfer_rumour && (
          <FtSection label="📰 Transfer Desk" content={edition.transfer_rumour} sectionKey="transfers" ft={ft} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ isOwner, onGenerate, generating, genError }) {
  return (
    <div style={{ background: FT_PAPER, color: FT_INK, padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ fontFamily: FT_SLAB, fontSize: 24, letterSpacing: '.04em', color: FT_INK, marginBottom: 4 }}>
        FORZA TIMES
      </div>
      <div style={{ height: 2, background: FT_INK, maxWidth: 200, margin: '0 auto 20px' }} />
      <p style={{ fontFamily: FT_SERIF, fontSize: 14, color: FT_MUTE, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
        No edition published yet today. The Forza Times will come to life once your leagues kick off.
      </p>
      {isOwner && (
        <div>
          <button
            onClick={onGenerate}
            disabled={generating}
            style={{
              padding: '11px 24px',
              border: 'none',
              background: FT_GOLD,
              color: FT_PAPER,
              fontFamily: FT_MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.16em',
              cursor: generating ? 'default' : 'pointer',
            }}
          >
            {generating ? 'GENERATING…' : 'PUBLISH SPECIAL EDITION →'}
          </button>
          {genError && (
            <div style={{ fontFamily: FT_MONO, fontSize: 10, color: 'var(--danger)', marginTop: 10 }}>{genError}</div>
          )}
          <p style={{ fontFamily: FT_MONO, fontSize: 9, color: FT_MUTE, letterSpacing: '.1em', marginTop: 10 }}>
            AS CLUBHOUSE OWNER · MAX 1 PER 4 HOURS
          </p>
        </div>
      )}
    </div>
  );
}

export default function ClubhouseFrontpage({ circleId, circleName, isOwner }) {
  const ft = useClubhouseFrontpage(circleId);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    try {
      const { error } = await supabase.functions.invoke('generate-frontpage-edition', {
        body: { circle_id: circleId },
      });
      if (error) throw new Error(error.message ?? 'Generation failed');
      ft.refresh();
    } catch (err) {
      const msg = err?.message ?? '';
      setGenError(
        msg.includes('already published')
          ? msg
          : 'Generation failed — check that the Groq API key is configured.'
      );
    } finally {
      setGenerating(false);
    }
  }

  if (ft.loading) {
    return (
      <div style={{ background: FT_PAPER, padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontFamily: FT_MONO, fontSize: 10, letterSpacing: '.16em', color: FT_MUTE }}>
          LOADING FORZA TIMES…
        </div>
      </div>
    );
  }

  if (!ft.edition) {
    return (
      <EmptyState
        isOwner={isOwner}
        onGenerate={handleGenerate}
        generating={generating}
        genError={genError}
      />
    );
  }

  return (
    <EditionView
      edition={ft.edition}
      ft={ft}
      circleName={circleName ?? 'Clubhouse'}
      isOwner={isOwner}
      onGenerate={handleGenerate}
      generating={generating}
      genError={genError}
    />
  );
}
