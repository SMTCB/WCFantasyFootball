// Leaf module: pure constants and helpers with no React imports.
// Keeping these separate from LeagueBadges.jsx satisfies react-refresh/only-export-components
// (a file exporting both components and non-components breaks fast refresh).

export const TYPE_COLOR = { H2H: '#00B4D8', CLASSIC: '#E0A800', DRAFT: '#A855F7' };

// Derive {type, format} for TypeChip from a `leagues` row
// type: H2H if h2h_enabled, else the format (DRAFT or CLASSIC)
// format: DRAFT if league_mode==='draft' or format==='noduplicate', else CLASSIC
export function deriveLeagueType(lg) {
  const isDraft = lg?.league_mode === 'draft' || lg?.format === 'noduplicate';
  const format = isDraft ? 'DRAFT' : 'CLASSIC';
  const type = lg?.h2h_enabled ? 'H2H' : format;
  return { type, format };
}
