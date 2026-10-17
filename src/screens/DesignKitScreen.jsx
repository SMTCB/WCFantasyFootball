// Dev-only preview of the redesign kit (route /dev/kit, stripped from production builds).
import { Card, StatPill, StatusBar, PageHeader, EmptyState, ErrorState } from '../components/ui';
import ClubCrest from '../components/ClubCrest';
import Button from '../components/Button';
import { applyTheme } from '../lib/theme';

const SWATCHES = ['bg', 'card', 'raised', 'rule', 'accent', 'gold', 'good', 'crit', 'navy'];

export default function DesignKitScreen() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        title="Frontrow design kit"
        meta={<><StatPill>Wave 0</StatPill><StatPill tone="accent">Dev only</StatPill></>}
        stats={<div><b style={{ fontSize: 24 }}>12</b><div style={{ fontSize: 12, color: 'var(--mute)' }}>tokens</div></div>}
      >
        <div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
          <Button size="sm" variant="secondary" onClick={() => applyTheme('light')}>Light</Button>
          <Button size="sm" variant="secondary" onClick={() => applyTheme('dark')}>Dark</Button>
        </div>
      </PageHeader>
      <StatusBar tone="good">Transfer window open · closes in <span className="num">2d 4h</span></StatusBar>
      <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 720, margin: '0 auto' }}>
        <Card>
          <h2 style={{ margin: '0 0 12px', fontSize: 'var(--fs-heading)' }}>Colour tokens</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SWATCHES.map((n) => (
              <div key={n} style={{ textAlign: 'center', fontSize: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 'var(--radius)', background: `var(--${n})`, border: '1px solid var(--rule)' }} />
                {n}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 style={{ margin: '0 0 12px', fontSize: 'var(--fs-heading)' }}>Pills and buttons</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatPill>Draft · H2H</StatPill><StatPill tone="accent">Gameweek 3</StatPill>
            <StatPill tone="good">Free agent</StatPill><StatPill tone="warn">Doubt</StatPill><StatPill tone="crit">Out</StatPill>
            <Button>Confirm transfer</Button><Button variant="secondary">Stats</Button><Button variant="danger">Sell</Button>
          </div>
        </Card>
        <Card>
          <h2 style={{ margin: '0 0 12px', fontSize: 'var(--fs-heading)' }}>Crest</h2>
          <ClubCrest name="Arsenal" size={32} />
        </Card>
        <Card padded={false}><EmptyState title="No transfers yet" body="Players you buy or sell will show here." /></Card>
        <Card padded={false}><ErrorState onRetry={() => {}} /></Card>
      </div>
    </div>
  );
}
