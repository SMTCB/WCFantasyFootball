// Chip catalogue shared by the Squad Chips tab and the Commissioner switches.
// Ids match chips_used.chip_type (and 'joker' for daily_jokers); server rules live in
// supabase/migrations/304_chips_engine.sql — this file is copy + presentation only.
export const CHIPS = [
  {
    id: 'triple_captain',
    name: 'Triple Captain',
    badge: '×3',
    rule: 'Your captain scores ×3 instead of ×2 for one round.',
    detail: 'Once per tournament. Set your captain first — if they sit out, the bonus moves to your best starter.',
    tone: 'var(--gold)',
    toneText: 'var(--gold-text)',
  },
  {
    id: 'joker',
    name: 'Joker',
    badge: '×2',
    rule: 'Pick one player outside your squad — their points count ×2 this round.',
    detail: 'Once per tournament. The player doesn’t take a squad slot or affect your formation.',
    tone: 'var(--purple)',
    toneText: 'var(--purple)',
  },
  {
    id: 'max_cap',
    name: 'Max Cap',
    badge: 'AUTO',
    rule: 'Skip the captain pick — ×2 goes to whichever starter scores most this round.',
    detail: 'Once per tournament. Applied automatically when the round’s scores are final.',
    tone: 'var(--accent)',
    toneText: 'var(--accent)',
  },
];

export const CHIP_BY_ID = Object.fromEntries(CHIPS.map(c => [c.id, c]));

export function roundLabel(matchdayId) {
  if (!matchdayId) return '';
  const m = /-r(\d+)$/i.exec(matchdayId);
  return m ? `Round ${m[1]}` : matchdayId;
}
