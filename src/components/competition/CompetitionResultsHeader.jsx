const MEDAL = ['🥇', '🥈', '🥉'];
const MONO  = 'JetBrains Mono, monospace';
const DISP  = 'Archivo Black, sans-serif';

/**
 * Shared Tier-2 standings table used by Football, F1, and Tennis.
 *
 * Props:
 *   rows            - array of data objects (each must have a `user_id` field)
 *   columns         - [{ key, label, width, accessor, color?, activeAccent? }]
 *                     accessor: fn(row) => displayValue
 *                     color: static value color (overrides default muted)
 *                     activeAccent: color to use when this col is `activeColumnKey`
 *                                   (defaults to the top-level `accent` prop)
 *   accent          - CSS var for the active competition's sport color
 *   activeColumnKey - column key to highlight (header + value colored with accent)
 *   highlightUserId - user id to mark with highlight border + "YOU" badge
 *   useMedals       - show 🥇🥈🥉 for rows 0–2 instead of rank number
 *   rankWidth       - CSS width of the rank column (default '28px')
 *   nameLabel       - header label for the name column (default 'MANAGER')
 *   renderName      - (row, isMe) => ReactNode  — name cell content
 *   renderActions   - (row, isMe) => ReactNode  — optional final column
 *   actionsWidth    - CSS width of the actions column (default '100px')
 *   gap             - grid column-gap in px (default 8)
 *   rowPadding      - CSS padding string for each row (default '12px 16px')
 *   loading         - show loading state instead of rows
 *   emptyMessage    - text shown when rows is empty
 *   emptyIcon       - emoji shown with the empty message
 */
export function CompetitionResultsHeader({
  rows = [],
  columns = [],
  accent = 'var(--accent)',
  activeColumnKey,
  highlightUserId,
  useMedals = false,
  rankWidth = '28px',
  nameLabel = 'MANAGER',
  renderName,
  renderActions,
  actionsWidth = '100px',
  gap = 8,
  rowPadding = '12px 16px',
  loading = false,
  emptyMessage = 'No data yet.',
  emptyIcon = '—',
}) {
  const hasActions = typeof renderActions === 'function';

  const gridTemplate = [
    rankWidth,
    '1fr',
    ...columns.map(c => c.width ?? '52px'),
    ...(hasActions ? [actionsWidth] : []),
  ].join(' ');

  const gapPx = `${gap}px`;

  const headerCellStyle = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.12em',
    color: 'var(--mute)',
  };

  if (loading) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
          LOADING…
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>{emptyIcon}</div>
        <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--mute)' }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        columnGap: gapPx,
        padding: rowPadding,
        borderBottom: '1px solid var(--rule)',
        alignItems: 'center',
      }}>
        <div /> {/* rank */}
        <div style={headerCellStyle}>{nameLabel}</div>
        {columns.map(col => {
          const isActive = col.key === activeColumnKey;
          return (
            <div key={col.key} style={{
              ...headerCellStyle,
              textAlign: 'right',
              color: isActive ? accent : 'var(--mute)',
            }}>
              {col.label}
            </div>
          );
        })}
        {hasActions && <div />}
      </div>

      {/* Data rows */}
      {rows.map((row, i) => {
        const isMe = !!(highlightUserId && row.user_id === highlightUserId);
        const rank = useMedals && i < 3
          ? MEDAL[i]
          : (row.rank ?? i + 1);

        return (
          <div
            key={row.user_id ?? i}
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              columnGap: gapPx,
              padding: rowPadding,
              borderBottom: '1px solid var(--rule)',
              alignItems: 'center',
              borderLeft: isMe ? `2px solid ${accent}` : '2px solid transparent',
              background: isMe ? `color-mix(in srgb, ${accent} 6%, transparent)` : 'transparent',
            }}
          >
            {/* Rank / medal */}
            <span style={{
              fontFamily: DISP,
              fontSize: i < 3 && useMedals ? 18 : 14,
              color: 'var(--mute)',
              minWidth: 18,
            }}>
              {rank}
            </span>

            {/* Name cell */}
            <div style={{ minWidth: 0 }}>
              {renderName ? renderName(row, isMe) : (
                <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)' }}>
                  {row.username ?? row.display_name ?? row.name ?? '—'}
                </span>
              )}
            </div>

            {/* Numeric columns */}
            {columns.map(col => {
              const isActive = col.key === activeColumnKey;
              const activeColor = col.activeAccent ?? accent;
              const color = col.color ?? (isActive ? activeColor : 'var(--mute)');
              const value = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
              return (
                <div key={col.key} style={{
                  textAlign: 'right',
                  fontFamily: DISP,
                  fontSize: isActive ? 16 : 14,
                  color,
                }}>
                  {value ?? '—'}
                </div>
              );
            })}

            {/* Actions */}
            {hasActions && (
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {renderActions(row, isMe)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
