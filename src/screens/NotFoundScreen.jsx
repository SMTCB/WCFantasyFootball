import { useNavigate } from 'react-router-dom';

export default function NotFoundScreen() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 min-w-0 flex items-center justify-center min-h-[60vh] px-6">
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize:      '80px',
          lineHeight:    1,
          color:         'var(--mute)',
          letterSpacing: '-0.02em',
          marginBottom:  '16px',
        }}>
          404
        </div>
        <div style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize:      '18px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color:         'var(--paper)',
          marginBottom:  '8px',
        }}>
          Page not found
        </div>
        <p style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize:   '12px',
          color:      'var(--mute)',
          lineHeight: 1.6,
          marginBottom: '28px',
        }}>
          This page doesn't exist or has moved.
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          style={{
            fontFamily:    'Archivo Black, sans-serif',
            fontSize:      '11px',
            fontWeight:    800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding:       '10px 20px',
            background:    'var(--cyan)',
            color:         '#000',
            border:        'none',
            borderRadius:  '4px',
            cursor:        'pointer',
          }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
