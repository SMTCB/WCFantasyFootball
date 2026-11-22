// Catalogue sections for the dev-only design kit (/dev/kit). Each section shows one
// family of shared components in every variant and state, with the import line to use.
import { useState } from 'react';
import { Card, StatPill, StatusBar, PageHeader, EmptyState, ErrorState } from '../../components/ui';
import Button from '../../components/Button';
import TextInput from '../../components/TextInput';
import Select from '../../components/Select';
import Skeleton, { LoadingRows } from '../../components/Skeleton';
import SectionHeader from '../../components/SectionHeader';
import StatusDot from '../../components/StatusDot';
import PositionChip from '../../components/PositionChip';
import ClubCrest from '../../components/ClubCrest';
import ConfirmModal from '../../components/ConfirmModal';
import BottomSheet from '../../components/shared/BottomSheet';
import TabStrip from '../../components/shared/TabStrip';
import PrimaryActionBar from '../../components/shared/PrimaryActionBar';
import { Icon, Dot, ICON_NAMES } from '../../components/UiIcons';
import { useToast } from '../../hooks/useToast';
import { KIT_SECTIONS } from './kitSectionList';

const COLOUR_GROUPS = [
  ['Surfaces', ['bg', 'card', 'raised', 'elev', 'rule']],
  ['Text', ['paper', 'ink-soft', 'mute', 'on-accent']],
  ['Brand', ['accent', 'accent-soft', 'navy', 'gold', 'gold-soft', 'gold-text']],
  ['Status', ['good', 'good-soft', 'positive', 'warn', 'crit', 'crit-soft', 'danger']],
  ['Sports', ['f1', 'ten']],
  ['Positions', ['pos-gk', 'pos-def', 'pos-mid', 'pos-fwd']],
];
const TYPE_SCALE = ['fs-display', 'fs-heading', 'fs-title', 'fs-body-lg', 'fs-body', 'fs-label', 'fs-micro'];

const label = { fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginBottom: 6, fontWeight: 600 };
const row = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

function Demo({ title, use, children }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={label}>{title}</div>
      {children}
      {use && <code style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{use}</code>}
    </div>
  );
}

function tokenValue(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

function Colours() {
  return COLOUR_GROUPS.map(([group, names]) => (
    <Demo key={group} title={group}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 10 }}>
        {names.map((n) => {
          const v = tokenValue(n);
          return (
            <div key={n} style={{ fontSize: 'var(--fs-micro)', minWidth: 0 }}>
              <div style={{ height: 44, borderRadius: 'var(--radius)', background: `var(--${n})`, border: '1px solid var(--rule)' }} />
              <div style={{ fontWeight: 700, marginTop: 4 }}>--{n}</div>
              <div style={{ color: v ? 'var(--mute)' : 'var(--crit)' }}>{v || 'not defined'}</div>
            </div>
          );
        })}
      </div>
    </Demo>
  ));
}

function Type() {
  return (
    <>
      {TYPE_SCALE.map((t) => (
        <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <code style={{ width: 110, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>--{t}</code>
          <span style={{ fontSize: `var(--${t})`, fontFamily: t === 'fs-display' || t === 'fs-heading' ? "'Archivo Black', sans-serif" : undefined }}>
            Clubhouse matchday
          </span>
        </div>
      ))}
      <Demo title="Numbers use the .num class (tabular figures)">
        <div className="num" style={{ fontSize: 'var(--fs-title)' }}>€12.5M · 1,280 pts · 2d 4h</div>
      </Demo>
    </>
  );
}

function Buttons() {
  const variants = ['primary', 'secondary', 'ghost', 'danger', 'gold'];
  return (
    <>
      {variants.map((v) => (
        <Demo key={v} title={v}>
          <div style={row}>
            <Button variant={v} size="sm">Small</Button>
            <Button variant={v}>Medium</Button>
            <Button variant={v} size="lg">Large</Button>
            <Button variant={v} loading>Saving</Button>
            <Button variant={v} disabled>Disabled</Button>
          </div>
        </Demo>
      ))}
      <Demo title="With icons, icon-only, full width" use={"import Button from '../components/Button'"}>
        <div style={row}>
          <Button leftIcon={<Icon name="swap" />}>Make a trade</Button>
          <Button variant="secondary" rightIcon={<Icon name="link" />}>Copy invite</Button>
          <Button variant="icon" aria-label="Settings"><Icon name="gear" /></Button>
        </div>
        <Button fullWidth>Lock squad</Button>
      </Demo>
    </>
  );
}

function Inputs() {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      <TextInput label="League name" placeholder="Sunday Legends" value={v} onChange={(e) => setV(e.target.value)} helperText="Shown to every member." />
      <TextInput label="Invite code" required error="That code does not exist." defaultValue="XK2-91" />
      <TextInput label="Compact search" size="sm" placeholder="Search players" />
      <TextInput label="Notes" multiline rows={3} placeholder="Anything the members should know" />
      <Select label="Position" defaultValue="">
        <option value="">All positions</option>
        <option value="GK">Goalkeeper</option>
        <option value="DEF">Defender</option>
      </Select>
      <Select label="Budget" size="sm" error="Pick a budget." defaultValue="">
        <option value="">Choose…</option>
        <option>€100M</option>
      </Select>
      <code style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink-soft)' }}>
        import TextInput from &apos;../components/TextInput&apos; · Select from &apos;../components/Select&apos;
      </code>
    </div>
  );
}

function Pills() {
  return (
    <>
      <Demo title="StatPill tones" use={"import { StatPill } from '../components/ui'"}>
        <div style={row}>
          <StatPill>Draft · H2H</StatPill><StatPill tone="accent">Gameweek 3</StatPill>
          <StatPill tone="good">Free agent</StatPill><StatPill tone="warn">Doubt</StatPill><StatPill tone="crit">Out</StatPill>
        </div>
      </Demo>
      <Demo title="StatusBar tones" use={"import { StatusBar } from '../components/ui'"}>
        <div style={{ display: 'grid', gap: 4 }}>
          <StatusBar tone="info" icon={<Icon name="clock" />}>Deadline Saturday 11:00</StatusBar>
          <StatusBar tone="good" icon={<Icon name="swap" />}>Transfer window open · closes in <span className="num">2d 4h</span></StatusBar>
          <StatusBar tone="warn" icon={<Icon name="warning" />} action={<Button size="sm" variant="secondary">Fix</Button>}>Two players are doubtful</StatusBar>
          <StatusBar tone="crit" icon={<Icon name="lock" />}>Squad locked</StatusBar>
        </div>
      </Demo>
      <Demo title="Player status and positions">
        <div style={row}>
          <StatusDot status="fit" showLabel /><StatusDot status="doubt" showLabel /><StatusDot status="out" showLabel />
          {['GK', 'DEF', 'MID', 'FWD'].map((p) => <PositionChip key={p} pos={p} />)}
          <PositionChip pos="MID" empty />
        </div>
      </Demo>
      <Demo title="Dots and crests">
        <div style={row}>
          <Dot color="var(--good)" label="Fit" /><Dot color="var(--gold)" /><Dot color="var(--crit)" size={8} />
          <ClubCrest name="Arsenal" size={28} /><ClubCrest name="Liverpool" size={28} /><ClubCrest name="Brazil" size={28} />
        </div>
      </Demo>
    </>
  );
}

function Surfaces() {
  return (
    <>
      <Demo title="Card, raised card, unpadded card" use={"import { Card } from '../components/ui'"}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          <Card>Default card, 16px padding.</Card>
          <Card tone="raised">Raised tone for nested panels.</Card>
          <Card padded={false}><div style={{ padding: 12 }}>Unpadded, the content sets its own.</div></Card>
        </div>
      </Demo>
      <Demo title="PageHeader" use={"import { PageHeader } from '../components/ui'"}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <PageHeader
            title="Sunday Legends"
            meta={<><StatPill>Classic</StatPill><StatPill tone="accent">GW 12</StatPill></>}
            stats={<div><b style={{ fontSize: 'var(--fs-title)' }}>1,280</b><div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>points</div></div>}
          >
            <div style={{ paddingBottom: 12 }} />
          </PageHeader>
        </Card>
      </Demo>
      <Demo title="SectionHeader accents" use={"import SectionHeader from '../components/SectionHeader'"}>
        <Card padded={false}>
          {['cyan', 'gold', 'red', 'gk', 'def', 'mid', 'fwd'].map((a, i) => (
            <SectionHeader key={a} title={a.toUpperCase()} accent={a} count={i ? i * 3 : undefined}
              action={i === 0 ? <Button size="sm" variant="ghost">See all</Button> : null} />
          ))}
        </Card>
      </Demo>
    </>
  );
}

function States() {
  return (
    <>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        <Card padded={false}>
          <EmptyState icon={<Icon name="swap" size={28} />} title="No transfers yet" body="Players you buy or sell will show here." action={<Button size="sm">Open market</Button>} />
        </Card>
        <Card padded={false}><ErrorState onRetry={() => {}} /></Card>
      </div>
      <Demo title="Skeleton shapes and LoadingRows" use={"import Skeleton, { LoadingRows } from '../components/Skeleton'"}>
        <Card style={{ display: 'grid', gap: 10 }}>
          <Skeleton shape="line" />
          <Skeleton shape="line" className="w-4/5" />
          <div style={row}><Skeleton shape="circle" className="w-12 h-12" /><Skeleton shape="circle" variant="shimmer" className="w-12 h-12" /></div>
          <Skeleton shape="block" className="h-24" variant="shimmer" />
          <LoadingRows rows={3} />
        </Card>
      </Demo>
    </>
  );
}

function Icons() {
  return (
    <Demo title={`${ICON_NAMES.length} icons, sized to the text (1em) by default`} use={'import { Icon } from \'../components/UiIcons\' · <Icon name="trophy" />'}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {ICON_NAMES.map((n) => (
          <div key={n} style={{ textAlign: 'center', padding: '10px 4px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', background: 'var(--card)' }}>
            <Icon name={n} size={22} />
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 4, overflowWrap: 'anywhere' }}>{n}</div>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function Overlays() {
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  return (
    <>
      <Demo title="Sheets and dialogs" use={"import BottomSheet from '../components/shared/BottomSheet' · ConfirmModal from '../components/ConfirmModal'"}>
        <div style={row}>
          <Button variant="secondary" onClick={() => setSheet(true)}>Open bottom sheet</Button>
          <Button variant="secondary" onClick={() => setConfirm({ title: 'Leave Sunday Legends?', body: 'Your squad and points stay in the league history.', confirmLabel: 'Leave', danger: true })}>Confirm (tap)</Button>
          <Button variant="secondary" onClick={() => setConfirm({ title: 'Sell Bellingham?', body: 'You get €11.5M back into your budget.', warning: 'He is your captain: selling removes the armband.', confirmLabel: 'Sell', danger: true, slideToConfirm: true })}>Confirm (slide)</Button>
        </div>
      </Demo>
      <Demo title="Toasts" use={"const toast = useToast(); toast.show('Saved', 'success')"}>
        <div style={row}>
          {['success', 'info', 'warning', 'error'].map((t) => (
            <Button key={t} size="sm" variant="ghost" onClick={() => toast?.show(`This is a ${t} message`, t)}>{t}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => toast?.show('Could not save picks', 'error', 3500, async () => {}, 'Check your connection.')}>error with retry</Button>
        </div>
      </Demo>
      {sheet && (
        <BottomSheet onClose={() => setSheet(false)} ariaLabel="Example sheet">
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, fontFamily: "'Archivo Black', sans-serif", fontSize: 'var(--fs-title)' }}>Bottom sheet</h3>
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Focus is trapped inside; Escape or the backdrop closes it.</p>
            <Button onClick={() => setSheet(false)}>Done</Button>
          </div>
        </BottomSheet>
      )}
      {confirm && (
        <ConfirmModal {...confirm} onConfirm={() => setConfirm(null)} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}

function Navigation() {
  const tabs = [
    { key: 'table', label: 'Table' },
    { key: 'team', label: 'My team' },
    { key: 'room', label: 'The Room', count: 3 },
    { key: 'bets', label: 'Bets', notify: true },
    { key: 'trades', label: 'Trades' },
    { key: 'cup', label: 'Cup' },
  ];
  const [a, setA] = useState('team');
  const [b, setB] = useState('room');
  const [bar, setBar] = useState(null);
  return (
    <>
      <Demo title="TabStrip pill (league)" use={"import TabStrip from '../components/shared/TabStrip'"}>
        <TabStrip tabs={tabs} active={a} onTab={setA} />
      </Demo>
      <Demo title="TabStrip underline (Clubhouse)">
        <TabStrip tabs={tabs} active={b} onTab={setB} variant="underline" />
      </Demo>
      <Demo title="PrimaryActionBar (phone only; floats above the bottom nav)" use={"import PrimaryActionBar from '../components/shared/PrimaryActionBar'"}>
        <div style={row}>
          {['action', 'done', 'locked'].map((s) => (
            <Button key={s} size="sm" variant={bar === s ? 'primary' : 'secondary'} onClick={() => setBar(bar === s ? null : s)}>{s}</Button>
          ))}
        </div>
      </Demo>
      {bar && <PrimaryActionBar state={bar} icon="calendar" label="Set your GW13 squad" countdown="2d 4h left" onPress={() => setBar(null)} />}
    </>
  );
}

function Placeholder({ h = 80, children }) {
  return (
    <Card style={{ minHeight: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>
      {children}
    </Card>
  );
}

function Layouts() {
  return (
    <>
      <Demo title=".sport-split: main column with a 360px side panel from 1024px; stacked below" use={'<div className="sport-split"><div className="sport-main">…</div><aside className="sport-aside">…</aside></div>'}>
        <div className="sport-split">
          <div className="sport-main" style={{ display: 'grid', gap: 12 }}>
            <Placeholder h={140}>.sport-main</Placeholder>
            <Placeholder>.sport-main, second block</Placeholder>
          </div>
          <div className="sport-aside"><Placeholder h={120}>.sport-aside</Placeholder></div>
        </div>
      </Demo>
      <Demo title=".sport-cards: a single column on phones, a 340px-minimum grid from 1024px" use={'<div className="sport-cards">…</div>'}>
        <div className="sport-cards">
          {[1, 2, 3, 4].map((i) => <Placeholder key={i}>Card {i}</Placeholder>)}
        </div>
      </Demo>
    </>
  );
}

const BODIES = {
  colours: Colours, type: Type, buttons: Buttons, inputs: Inputs, pills: Pills, surfaces: Surfaces,
  states: States, icons: Icons, overlays: Overlays, navigation: Navigation, layouts: Layouts,
};

// Renders every catalogue section, or only the one whose id is `only`.
export default function KitSections({ only }) {
  const list = only ? KIT_SECTIONS.filter((s) => s.id === only) : KIT_SECTIONS;
  return (
    <div style={{ padding: 16, display: 'grid', gap: 28, maxWidth: 1180, margin: '0 auto' }}>
      {list.map(({ id, title }) => {
        const Body = BODIES[id];
        return (
          <section key={id} id={`kit-${id}`} style={{ display: 'grid', gap: 14, scrollMarginTop: 120 }}>
            <h2 style={{ margin: 0, fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 'var(--fs-heading)' }}>{title}</h2>
            <Body />
          </section>
        );
      })}
    </div>
  );
}
