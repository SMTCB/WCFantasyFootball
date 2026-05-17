/**
 * Button — single source of truth for the project's button styles.
 *
 * Replaces the ~15 inline button definitions scattered across screens
 * (each redefining bg/color/padding/onMouseEnter/onMouseLeave). All visual
 * states — hover, focus-visible, disabled, loading — are driven by CSS
 * classes defined in src/index.css under `.ffl-btn`.
 *
 * Usage:
 *   <Button onClick={...}>Sign In</Button>                              // primary md
 *   <Button variant="secondary" size="lg">Cancel</Button>
 *   <Button variant="ghost" onClick={skip}>Skip tour</Button>
 *   <Button variant="danger" loading={saving}>Delete</Button>
 *   <Button variant="icon" aria-label="Go back">←</Button>
 *
 * Polymorphism:
 *   <Button as="a" href="/squad">View squad</Button>
 *   <Button as={Link} to="/squad">View squad</Button>            // react-router
 *
 * Props are passed through to the underlying element, so type="submit",
 * form, name, value, target, rel, etc. all work as expected.
 */

const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger', 'gold', 'icon']);
const SIZES    = new Set(['sm', 'md', 'lg']);

export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon = null,
  rightIcon = null,
  className = '',
  type,
  children,
  ...rest
}) {
  const v = VARIANTS.has(variant) ? variant : 'primary';
  const s = SIZES.has(size) ? size : 'md';

  const classes = [
    'ffl-btn',
    `ffl-btn--${v}`,
    `ffl-btn--${s}`,
    className,
  ].filter(Boolean).join(' ');

  // Only set type when the underlying element is a real <button> — otherwise
  // (e.g., <a>, <Link>) the attribute is invalid HTML.
  const buttonProps = Component === 'button' ? { type: type || 'button' } : {};

  return (
    <Component
      className={classes}
      data-loading={loading ? 'true' : undefined}
      data-full-width={fullWidth ? 'true' : undefined}
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      disabled={Component === 'button' ? (disabled || loading) : undefined}
      {...buttonProps}
      {...rest}
    >
      {loading ? <span className="ffl-btn__spinner" aria-hidden="true" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </Component>
  );
}
