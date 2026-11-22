// Dev-only component catalogue (route /dev/kit, stripped from production builds).
// Every shared component in its variants and states, without a login or live data.
// The width picker loads the same page in an iframe at phone, tablet or desktop width,
// so media queries (bottom nav, .sport-split) behave as they do on a real device.
// ?frame=1 renders the sections only (the iframe view); &section=<id> narrows to one.
import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import KitSections from './devkit/KitSections';
import { KIT_SECTIONS } from './devkit/kitSectionList';

const WIDTHS = [
  ['full', 'Full width'],
  ['375', 'Phone 375'],
  ['768', 'Tablet 768'],
  ['1280', 'Desktop 1280'],
];

export default function DesignKitScreen() {
  const [params, setParams] = useSearchParams();
  const only = params.get('section') || '';
  const width = params.get('w') || 'full';
  const page = { background: 'var(--bg)', color: 'var(--paper)', minHeight: '100vh' };

  if (params.get('frame') === '1') {
    return <div style={page}><KitSections only={only} /></div>;
  }

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const frameSrc = `/dev/kit?frame=1${only ? `&section=${only}` : ''}`;

  return (
    <div style={page}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: '12px 16px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 'var(--fs-title)' }}>Clubhouse components</h1>
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Dev only · not in the live app</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Width">
          {WIDTHS.map(([w, text]) => (
            <Button key={w} size="sm" variant={width === w ? 'primary' : 'secondary'} aria-pressed={width === w} onClick={() => set('w', w === 'full' ? '' : w)}>{text}</Button>
          ))}
        </div>
        <nav style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} aria-label="Sections">
          <Button size="sm" variant={!only ? 'primary' : 'ghost'} onClick={() => set('section', '')}>All</Button>
          {KIT_SECTIONS.map((s) => (
            <Button key={s.id} size="sm" variant={only === s.id ? 'primary' : 'ghost'} style={{ whiteSpace: 'nowrap' }} onClick={() => set('section', s.id)}>{s.title}</Button>
          ))}
        </nav>
      </header>
      {width === 'full' ? (
        <KitSections only={only} />
      ) : (
        <div style={{ overflowX: 'auto', padding: 16 }}>
          <iframe
            key={frameSrc + width}
            title={`Components at ${width}px`}
            src={frameSrc}
            style={{ display: 'block', margin: '0 auto', width: Number(width), height: 'calc(100vh - 170px)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', background: 'var(--bg)' }}
          />
        </div>
      )}
    </div>
  );
}
