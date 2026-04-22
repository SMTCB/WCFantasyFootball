/**
 * PowerToolCard — Reusable component for squad power tools (Wildcard, Triple Captain, Roulette, Joker)
 *
 * Features:
 * - Large, touch-friendly card design (100-120px height)
 * - Prominent emoji icon (40px) with color variants
 * - Bold label and optional description
 * - Active/inactive state with visual indicators
 * - Integrates with confirm modals for destructive actions
 */

export default function PowerToolCard({
  icon,
  label,
  description,
  isActive = false,
  actionLabel = 'Activate',
  colorClass = 'text-cyan',
  accentColor = '#00C4E8',
  bgColor = 'rgba(0,196,232,0.05)',
  borderColor = 'rgba(0,196,232,0.1)',
  onAction
}) {
  return (
    <button
      onClick={onAction}
      className="w-full h-full min-h-[100px] rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        background: isActive ? `${bgColor}` : '#0D1117',
        border: `1.5px solid ${isActive ? accentColor : borderColor}`,
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        cursor: 'pointer',
        boxShadow: isActive
          ? `0 0 12px ${accentColor}33, inset 0 0 8px ${accentColor}08`
          : 'none',
        position: 'relative',
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: '40px', lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
        {icon}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: '12px',
          fontFamily: 'Barlow Condensed, sans-serif',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: isActive ? accentColor : '#F0F2F5',
          lineHeight: 1.2,
          textAlign: 'center',
        }}
      >
        {label}
      </div>

      {/* Description (optional) */}
      {description && (
        <div
          style={{
            fontSize: '9px',
            color: 'rgba(240,242,245,0.5)',
            lineHeight: 1.3,
            textAlign: 'center',
            maxWidth: '100%',
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 400,
          }}
        >
          {description}
        </div>
      )}

      {/* Active badge */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: accentColor,
            boxShadow: `0 0 6px ${accentColor}`,
            animation: 'pulse 2s infinite',
          }}
        />
      )}

      {/* Animation for active state */}
      {isActive && (
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      )}
    </button>
  );
}
