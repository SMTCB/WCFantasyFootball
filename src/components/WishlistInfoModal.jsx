import BottomSheet from './shared/BottomSheet';

const MONO    = 'Archivo, sans-serif';
const DISPLAY = 'Archivo Black, sans-serif';

function Section({ title, children, accent = 'var(--accent)' }) {
  return (
    <div style={{ padding: '14px 20px 0' }}>
      <div style={{ fontFamily: MONO, fontSize: 'var(--fs-label)', color: accent, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={{
      background: 'var(--elev)', borderRadius: 'var(--radius)', padding: '10px 14px',
      fontFamily: MONO, fontSize: 'var(--fs-label)', color: 'var(--paper)', lineHeight: 1.8,
    }}>
      {children}
    </div>
  );
}

export default function WishlistInfoModal({ onClose }) {
  return (
    <BottomSheet ariaLabel="Wishlist draft info"
      onClose={onClose}
      background="var(--card)"
      maxWidth={480}
      showHandle={false}
      contentStyle={{ padding: '0 0 32px' }}
    >
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
        borderBottom: '1px solid var(--rule)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
        }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em' }}>
              Wishlist draft
            </div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
              What it is · how it works
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--mute)',
              fontFamily: MONO, fontSize: 'var(--fs-label)', cursor: 'pointer', padding: 4,
            }}
          >
            CLOSE
          </button>
        </div>
      </div>

      <Section title="What it is">
        <InfoBox>
          <div>
            A recurring pick list, exclusive to draft-mode leagues. Each round, every manager
            ranks the players they want to target next, plus which of their own squad players
            they're willing to release to make room.
          </div>
        </InfoBox>
      </Section>

      <Section title="Why it exists">
        <InfoBox>
          <div>
            In a draft league every player belongs to at most one manager. The Wishlist Draft
            is how unowned players change hands fairly: instead of a scramble the moment the
            market opens, everyone's priorities are collected in advance and resolved in one
            automated pass. Whatever's left afterwards is first come, first served.
          </div>
        </InfoBox>
      </Section>

      <Section title="How it resolves">
        <InfoBox>
          <div style={{ marginBottom: 8 }}>
            Submissions are worked through in a <span style={{ color: 'var(--accent)', fontFamily: DISPLAY }}>rotating snake order</span> —
            the manager who picks first shifts by one seat every round, so no one gets stuck
            last every time.
          </div>
          <div style={{ marginBottom: 8 }}>
            Going down each manager's ranked target list in turn, the highest-priority player
            still available is awarded to them, freeing up one of the release slots they
            nominated. This continues until every manager's list is exhausted or no eligible
            targets remain.
          </div>
          <div style={{ marginBottom: 8 }}>
            A release only counts if it was needed: if your list runs dry before every release
            was replaced, the leftover players stay on your squad (unless another manager drafted
            them first).
          </div>
          <div style={{ color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>
            Only players not already on any roster in the league are eligible targets — the
            list below is automatically filtered to exclude anyone already owned.
          </div>
        </InfoBox>
      </Section>

      <Section title="When it runs">
        <InfoBox>
          <div style={{ marginBottom: 8 }}>
            Your commissioner picks one of three settings for each round:
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: 'var(--accent)', fontFamily: DISPLAY }}>AUTO</span> — the draft runs at a set
            date and time, shown on the league banner (announced at least 6 hours ahead).
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: 'var(--accent)', fontFamily: DISPLAY }}>MANUAL</span> — the commissioner runs it.
            If they don't, it runs automatically 8 hours before the round's first kickoff.
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: 'var(--accent)', fontFamily: DISPLAY }}>DISABLED</span> — no draft this round:
            the market is open, first come, first served. Your list is kept for when the draft returns.
          </div>
          <div style={{ color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>
            While a draft is pending the market is locked, but player-to-player trades still work.
            The market opens right after the draft runs.
          </div>
        </InfoBox>
      </Section>

      <Section title="If a target is gone">
        <InfoBox>
          <div>
            If someone else owns one of your targets by the time the draft runs (for example,
            they bought them during a free-market round), that player is simply skipped and
            the draft moves on to your next target. Your list carries over to the next round
            automatically — targets now owned by others show greyed out so you can replace them.
          </div>
        </InfoBox>
      </Section>

      <Section title="Editing your list">
        <InfoBox>
          <div>
            You can keep changing your targets and releases right up until the draft runs.
            Changes auto-save as you go — use <span style={{ color: 'var(--accent)', fontFamily: DISPLAY }}>SAVE</span> to
            checkpoint your list, or <span style={{ color: 'var(--positive)', fontFamily: DISPLAY }}>SUBMIT</span> once
            you're happy with it. Submitting doesn't lock anything — you can still return and
            adjust your list until the draft runs.
          </div>
        </InfoBox>
      </Section>
    </BottomSheet>
  );
}
