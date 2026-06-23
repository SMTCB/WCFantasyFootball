import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useClubhouseFrontpage, FT_EMOJIS } from '../hooks/useClubhouseFrontpage';
import { ReactionStrip, LettersPanel } from './league/FrontpageInteractive';

// Newspaper palette — cream background to feel like an actual broadsheet
const FT_INK    = '#1A1A18';
const FT_PAPER  = '#F2EEE5';
const FT_CREAM  = '#EAE6DC';
const FT_RULE   = '#C8C4BA';
const FT_MUTE   = '#8A8680';
const FT_GOLD   = '#B5933A';
const FT_MONO   = 'JetBrains Mono, monospace';
const FT_SERIF  = 'Georgia, "Times New Roman", serif';
const FT_SLAB   = 'Archivo Black, Impact, sans-serif';
const FT_BODY   = 'Archivo, sans-serif';

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: FT_RULE }} />
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: FT_RULE }} />
      <div style={{ flex: 1, height: 1, background: FT_RULE }} />
    </div>
  );
}

function FtSection({ label, content, sectionKey, ft }) {
  if (!content) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: FT_MONO, fontSize: 8, letterSpacing: '.2em', color: FT_MUTE, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <p style={{ fontFamily: FT_BODY, fontSize: 14, color: FT_INK, lineHeight: 1.65, margin: '0 0 8px' }}>
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

  return (
    <div style={{ background: FT_PAPER, color: FT_INK, fontFamily: FT_BODY, padding: '24px 20px 32px' }}>

      {/* Masthead */}
      <div style={{ textAlign: 'center', paddingBottom: 14, marginBottom: 4 }}>
        <div style={{ fontFamily: FT_MONO, fontSize: 8, letterSpacing: '.22em', color: FT_MUTE, marginBottom: 6, textTransform: 'uppercase' }}>
          {circleName} · The Clubhouse
        </div>
        <div style={{ fontFamily: FT_SLAB, fontSize: 28, letterSpacing: '.04em', color: FT_INK, lineHeight: 1, marginBottom: 4 }}>
          FORZA TIMES
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 2, background: FT_INK }} />
          <div style={{ fontFamily: FT_MONO, fontSize: 8, letterSpacing: '.16em', color: FT_MUTE, whiteSpace: 'nowrap' }}>
            EDITION #{edition.edition_number} · {dateLabel.toUpperCase()}
          </div>
          <div style={{ flex: 1, height: 2, background: FT_INK }} />
        </div>
      </div>

      <div style={{ height: 3, background: FT_INK, marginBottom: 18 }} />

      {/* Lead story */}
      {edition.headline && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: FT_SLAB, fontSize: 22, lineHeight: 1.15, color: FT_INK, margin: '0 0 10px', textTransform: 'uppercase' }}>
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

      <Divider />

      {/* Hot take + wooden spoon — two column on wide */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 4 }}>
        {edition.hot_take && (
          <div style={{ flex: '1 1 200px' }}>
            <FtSection label="🔥 Hot Take" content={edition.hot_take} sectionKey="hot_take" ft={ft} />
          </div>
        )}
        {edition.wooden_spoon && (
          <div style={{ flex: '1 1 200px' }}>
            <FtSection label="🥄 Wooden Spoon" content={edition.wooden_spoon} sectionKey="scores" ft={ft} />
          </div>
        )}
      </div>

      {edition.transfer_rumour && (
        <>
          <Divider />
          <FtSection label="📰 Transfer Desk" content={edition.transfer_rumour} sectionKey="transfers" ft={ft} />
        </>
      )}

      {/* Owner generate button */}
      {isOwner && (
        <>
          <Divider />
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={onGenerate}
              disabled={generating}
              style={{
                padding: '9px 20px',
                border: `1px solid ${FT_GOLD}`,
                background: 'transparent',
                color: generating ? FT_MUTE : FT_GOLD,
                fontFamily: FT_MONO,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.16em',
                cursor: generating ? 'default' : 'pointer',
              }}
            >
              {generating ? 'GENERATING…' : 'REGENERATE SPECIAL EDITION →'}
            </button>
            {genError && (
              <div style={{ fontFamily: FT_MONO, fontSize: 10, color: 'var(--danger)', marginTop: 8 }}>{genError}</div>
            )}
          </div>
        </>
      )}
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
