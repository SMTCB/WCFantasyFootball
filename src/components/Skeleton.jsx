/**
 * Skeleton — reusable loading state placeholder.
 *
 * All visual states (width, height, border-radius, animation) are driven by
 * CSS classes defined in src/index.css under `.ffl-skeleton`. This component
 * is purely structural, accepting shape and optional className for custom sizing.
 *
 * Shapes:
 *   line    — full-width text placeholder (h=12px)
 *   circle  — avatar/icon placeholder (60px square, border-radius 50%)
 *   block   — card/content block (full-width, h=200px)
 *   row     — table row with multiple columns
 *
 * Usage:
 *   <Skeleton shape="line" />                                   // text line
 *   <Skeleton shape="circle" className="w-12 h-12" />         // sm avatar
 *   <Skeleton shape="block" className="h-96" />                // custom height
 *   <Skeleton shape="row" />                                   // table row (4 cols)
 *
 *   // Loading state with semantic structure:
 *   {loading ? (
 *     <div className="space-y-3">
 *       <Skeleton shape="line" />
 *       <Skeleton shape="line" className="w-4/5" />
 *     </div>
 *   ) : (
 *     <Article />
 *   )}
 */

const SHAPES = new Set(['line', 'circle', 'block', 'row']);

export default function Skeleton({
  shape = 'line',
  className = '',
  ...rest
}) {
  const s = SHAPES.has(shape) ? shape : 'line';

  const baseClasses = [
    'ffl-skeleton',
    `ffl-skeleton--${s}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={baseClasses}
      role="status"
      aria-label="Loading"
      aria-busy="true"
      {...rest}
    />
  );
}
