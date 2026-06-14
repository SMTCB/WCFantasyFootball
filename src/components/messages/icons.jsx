// FORZAKIT message icons — see docs/brand/MESSAGES
// 14x14 viewBox, stroke-based, square line caps per spec.

function IconSuccess(props) {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" {...props}>
      <polyline points="2.5 7.5 5.5 10.5 11.5 3.5" />
    </svg>
  );
}

function IconWarning(props) {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" {...props}>
      <path d="M7 1.5 L13 12.5 L1 12.5 Z" />
      <line x1="7" y1="5.5" x2="7" y2="8.5" />
      <line x1="7" y1="10.5" x2="7" y2="10.5" />
    </svg>
  );
}

function IconError(props) {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" {...props}>
      <rect x="1.5" y="1.5" width="11" height="11" />
      <line x1="7" y1="4" x2="7" y2="8" />
      <line x1="7" y1="10.2" x2="7" y2="10.2" />
    </svg>
  );
}

function IconInfo(props) {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" {...props}>
      <rect x="1.5" y="1.5" width="11" height="11" />
      <line x1="7" y1="6.2" x2="7" y2="10" />
      <line x1="7" y1="3.6" x2="7" y2="3.6" />
    </svg>
  );
}

const ICON_BY_TYPE = {
  success: IconSuccess,
  warning: IconWarning,
  error: IconError,
  info: IconInfo,
};

export function MessageIcon({ type = 'info', ...props }) {
  const Icon = ICON_BY_TYPE[type] ?? IconInfo;
  return <Icon {...props} />;
}
