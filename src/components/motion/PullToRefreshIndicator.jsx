/**
 * PullToRefreshIndicator — the small spinner/arrow that tracks a pull gesture
 * driven by usePullToRefresh. Pass the hook's { progress, refreshing } straight
 * through. Renders nothing at rest so it costs nothing on screens that never pull.
 */
export default function PullToRefreshIndicator({ progress, refreshing }) {
  if (!refreshing && progress <= 0) return null;

  const height = refreshing ? 44 : Math.round(progress * 44);

  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: refreshing ? 'height 0.15s ease' : 'none',
      }}
      aria-hidden={!refreshing}
    >
      <div
        className={`ffl-ptr-spinner${refreshing ? ' ffl-ptr-spinner--spin' : ''}`}
        style={{
          transform: refreshing ? 'none' : `rotate(${progress * 360}deg)`,
          opacity: refreshing ? 1 : Math.max(0.3, progress),
        }}
      />
    </div>
  );
}
