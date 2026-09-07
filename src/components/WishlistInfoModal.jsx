import BottomSheet from './shared/BottomSheet';

const MONO    = 'var(--font-mono, monospace)';
const DISPLAY = 'Archivo Black, sans-serif';

function Section({ title, children, accent = 'var(--cyan)' }) {
  return (
    <div style={{ padding: '14px 20px 0' }}>
      <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.18em', color: accent, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={{
      background: 'var(--shell-fill)', borderRadius: 6, padding: '10px 14px',
      fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--paper)', lineHeight: 1.8, letterSpacing: '.04em',
    }}>
      {children}
    </div>
  );
}

export default function WishlistInfoModal({ onClose }) {
  return (
    <BottomSheet
      onClose={onClose}
      background="var(--ink)"
      maxWidth={480}
      showHandle={false}
      contentStyle={{ padding: '0 0 32px' }}
    >
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, background: 'var(--ink)', zIndex: 1,
        borderBottom: '1px solid var(--rule)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
        }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em' }}>
              WISHLIST DRAFT
            </div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>
              WHAT IT IS · HOW IT WORKS
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--mute)',
              fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.1em', cursor: 'pointer', padding: 4,
            }}
          >
            CLOSE
          </button>
        </div>
      </div>

      <Section title="WHAT IT IS">
        <InfoBox>
          <div>
            A recurring pick list, exclusive to draft-mode leagues. Each round, every manager
            ranks the players they want to target next, plus which of their own squad players
            they're willing to release to make room.
          </div>
        </InfoBox>
      </Section>

      <Section title="WHY IT EXISTS">
        <InfoBox>
          <div>
            Draft leagues don't have a transfer market where you buy and sell freely — every
            player is either on a roster or unowned. The Wishlist Draft is how unowned players
            change hands fairly: instead of a scramble the moment the market opens, everyone's
            priorities are collected in advance and resolved in one automated pass.
          </div>
        </InfoBox>
      </Section>

      <Section title="HOW IT RESOLVES">
        <InfoBox>
          <div style={{ marginBottom: 8 }}>
            Submissions are worked through in a <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>rotating snake order</span> —
            the manager who picks first shifts by one seat every round, so no one gets stuck
            last every time.
          </div>
          <div style={{ marginBottom: 8 }}>
            Going down each manager's ranked target list in turn, the highest-priority player
            still available is awarded to them, freeing up one of the release slots they
            nominated. This continues until every manager's list is exhausted or no eligible
            targets remain.
          </div>
          <div style={{ color: 'var(--mute)', fontSize: 'var(--fs-micro)' }}>
            Only players not already on any roster in the league are eligible targets — the
            list below is automatically filtered to exclude anyone already owned.
          </div>
        </InfoBox>
      </Section>

      <Section title="WHEN IT RUNS">
        <InfoBox>
          <div>
            There's no fixed deadline. The round resolves automatically shortly before that
            round's transfer market opens, using whatever each manager has submitted at that
            point — so it's worth keeping your list up to date, not filling it in once and
            forgetting it.
          </div>
        </InfoBox>
      </Section>

      <Section title="EDITING YOUR LIST">
        <InfoBox>
          <div>
            You can keep changing your targets and releases right up until the round resolves.
            Changes auto-save as you go — use <span style={{ color: 'var(--cyan)', fontFamily: DISPLAY }}>SAVE</span> to
            checkpoint your list, or <span style={{ color: 'var(--positive)', fontFamily: DISPLAY }}>SUBMIT</span> once
            you're happy with it. Submitting doesn't lock anything — you can still return and
            adjust your list until the round resolves.
          </div>
        </InfoBox>
      </Section>
    </BottomSheet>
  );
}
