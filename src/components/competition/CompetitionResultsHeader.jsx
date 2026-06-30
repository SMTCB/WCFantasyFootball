import { useState, useEffect } from 'react';

const MEDAL = ['🥇', '🥈', '🥉'];
const MONO  = 'JetBrains Mono, monospace';
const DISP  = 'Archivo Black, sans-serif';

// TODO(M0): replace with `import { useIsMobile } from '../../hooks/useViewport'`
//           once PR1 (claude/v2-m0-pr1-viewport-tokens) is merged into v2.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    const handler = () => setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

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
 *   leadColumnKey   - (mobile card-mode only) which column is the primary lead number.
 *                     Defaults to the last column. All other columns render as sub-chips.
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
  leadColumnKey,
}) {
  const isMobile  = useIsMobile();
  const hasActions = typeof renderActions === 'function';

  // ─── Derived ────────────────────────────────────────────────────────────────

  const effectiveLeadKey = leadColumnKey ?? (columns.length > 0 ? columns[columns.length - 1].key : null);
  const leadCol    = columns.find(c => c.key === effectiveLeadKey) ?? columns[columns.length - 1];
  const supportCols = columns.filter(c => c.key !== effectiveLeadKey);

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

  // ─── Loading / empty ────────────────────────────────────────────────────────

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

  // ─── Mobile card-mode ───────────────────────────────────────────────────────
  //
  // Each manager row becomes a compact card:
  //   [rank chip]  [name + support chips]  [lead value]
  //
  // This path only activates at < 640px. Desktop grid is pixel-identical below.
  // M1 will wire this into individual screen consumers.

  if (isMobile) {
    return (
      <div style={{ padding: '0 12px' }}>
        {rows.map((row, i) => {
          const isMe = !!(highlightUserId && row.user_id === highlightUserId);
          const rank = useMedals && i < 3 ? MEDAL[i] : (row.rank ?? i + 1);

          const leadIsActive = leadCol?.key === activeColumnKey;
          const leadColor = leadCol
            ? (leadCol.color ?? (leadIsActive ? (leadCol.activeAccent ?? accent) : accent))
            : accent;
          const leadValue = leadCol
            ? (typeof leadCol.accessor === 'function' ? leadCol.accessor(row) : row[leadCol.accessor])
            : '—';

          return (
            <div
              key={row.user_id ?? i}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          12,
                padding:      '10px 14px',
                marginBottom: 4,
                borderRadius: 8,
                background:   'var(--card)',
                border:       isMe
                  ? `1.5px solid ${accent}`
                  : '1px solid var(--rule)',
                boxShadow: isMe ? `0 0 0 3px color-mix(in srgb, ${accent} 12%, transparent)` : 'none',
              }}
            >
              {/* Rank chip */}
              <span
                style={{
                  fontFamily: DISP,
                  fontSize:   i < 3 && useMedals ? 18 : 13,
                  color:      isMe ? accent : 'var(--mute)',
                  minWidth:   22,
                  textAlign:  'center',
                  flexShrink: 0,
                }}
              >
                {rank}
              </span>

              {/* Name area + support chips */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ marginBottom: supportCols.length ? 4 : 0 }}>
                  {renderName ? renderName(row, isMe) : (
                    <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)', fontWeight: 600 }}>
                      {row.username ?? row.display_name ?? row.name ?? '—'}
                    </span>
                  )}
                </div>

                {/* Supporting columns as inline chips */}
                {supportCols.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {supportCols.map(col => {
                      const colIsActive = col.key === activeColumnKey;
                      const colColor = col.color ?? (colIsActive ? (col.activeAccent ?? accent) : 'var(--mute)');
                      const colVal = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
                      return (
                        <span
                          key={col.key}
                          style={{
                            fontFamily:    MONO,
                            fontSize:      9,
                            letterSpacing: '0.06em',
                            color:         colColor,
                            background:    colIsActive
                              ? `color-mix(in srgb, ${colColor} 12%, transparent)`
                              : 'var(--elev)',
                            border:        `1px solid ${colIsActive ? colColor : 'var(--rule)'}`,
                            borderRadius:  4,
                            padding:       '2px 5px',
                            whiteSpace:    'nowrap',
                          }}
                        >
                          {col.label} {colVal ?? '—'}
                        </span>
                      );
                    })}

                    {/* Actions inline */}
                    {hasActions && (
                      <span style={{ marginLeft: 2 }}>
                        {renderActions(row, isMe)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Lead value */}
              {leadCol && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontFamily: DISP,
                    fontSize:   20,
                    color:      leadColor,
                    lineHeight: 1.1,
                  }}>
                    {leadValue ?? '—'}
                  </div>
                  <div style={{
                    fontFamily:    MONO,
                    fontSize:      8,
                    letterSpacing: '0.1em',
                    color:         'var(--mute)',
                    marginTop:     2,
                  }}>
                    {leadCol.label}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Desktop grid-mode (pixel-identical to original) ────────────────────────

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
