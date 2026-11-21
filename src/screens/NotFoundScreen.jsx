import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';

export default function NotFoundScreen() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 min-w-0 flex items-center justify-center min-h-[60vh] px-6">
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize: 'var(--fs-display)',
          lineHeight:    1,
          color:         'var(--mute)',
          letterSpacing: '-0.02em',
          marginBottom:  '16px',
        }}>
          404
        </div>
        <div style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize: 'var(--fs-heading)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color:         'var(--paper)',
          marginBottom:  '8px',
        }}>
          Page not found
        </div>
        <p style={{
          fontFamily: 'Archivo, sans-serif',
          fontSize: 'var(--fs-label)',
          color:      'var(--mute)',
          lineHeight: 1.6,
          marginBottom: '28px',
        }}>
          This page doesn't exist or has moved.
        </p>
        <Button
          onClick={() => navigate('/', { replace: true })}>
          ← Back to Home
        </Button>
      </div>
    </div>
  );
}
