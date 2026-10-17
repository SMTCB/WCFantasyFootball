/** Surface card — one 12px corner, one border, token colours so dark mode just works. */
export default function Card({ as = 'div', padded = true, tone, style, children, ...rest }) {
  const Component = as;
  const bg = tone === 'raised' ? 'var(--raised)' : 'var(--card)';
  return (
    <Component
      style={{
        background: bg,
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
        padding: padded ? 16 : 0,
        minWidth: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}
