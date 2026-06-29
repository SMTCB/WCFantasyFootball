import { Link } from 'react-router-dom';
import {
  NavIconLive,
  NavIconSquad,
  NavIconLeagues,
  NavIconMarket,
  NavIconRecap,
  NavIconF1Calendar,
  NavIconF1Picks,
  NavIconF1Standings,
  NavIconF1Report,
  NavIconF1Season,
} from './NavIcons';

const FOOTBALL_SCREENS = [
  { key: 'live',   label: 'LIVE',   path: '/live',   Icon: NavIconLive,      isLive: true },
  { key: 'squad',  label: 'SQUAD',  path: '/squad',  Icon: NavIconSquad              },
  { key: 'league', label: 'LEAGUE', path: '/league', Icon: NavIconLeagues            },
  { key: 'market', label: 'MARKET', path: '/market', Icon: NavIconMarket             },
  { key: 'recap',  label: 'RECAP',  path: '/recap',  Icon: NavIconRecap              },
];

function buildF1Screens(paddockId) {
  const base = paddockId ? `/f1/${paddockId}` : '/f1';
  return [
    { key: 'f1-cal',  label: 'CALENDAR',  path: base,                    Icon: NavIconF1Calendar  },
    { key: 'f1-pick', label: 'PICKS',     path: `${base}/picks`,         Icon: NavIconF1Picks     },
    { key: 'f1-std',  label: 'STANDINGS', path: `${base}/standings`,     Icon: NavIconF1Standings },
    { key: 'f1-rep',  label: 'REPORT',    path: `${base}/report`,        Icon: NavIconF1Report    },
    { key: 'f1-sea',  label: 'SEASON',    path: `${base}/season`,        Icon: NavIconF1Season    },
  ];
}

const TENNIS_SCREENS = [
  { key: 'ten-home', label: 'HOME',        path: '/tennis',             Icon: null },
  { key: 'ten-lb',   label: 'LEADERBOARD', path: '/tennis/leaderboard', Icon: null },
];

export function CompetitionScreenNav({ pathname, paddockId }) {
  const isFoot   = ['/live', '/squad', '/league', '/market', '/recap'].some(
    p => pathname === p || pathname.startsWith(p + '/')
  );
  const isF1     = pathname.startsWith('/f1');
  const isTennis = pathname.startsWith('/tennis');

  if (!isFoot && !isF1 && !isTennis) return null;

  const screens     = isFoot ? FOOTBALL_SCREENS : isF1 ? buildF1Screens(paddockId) : TENNIS_SCREENS;
  const activeColor = isF1 ? 'var(--f1)' : isTennis ? 'var(--ten)' : 'var(--accent)';

  return (
    <div
      role="navigation"
      aria-label="Sport screens"
      style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--bg)',
        overflowX: 'auto', scrollbarWidth: 'none',
        minHeight: 44, flexShrink: 0,
      }}
    >
      {screens.map(({ key, label, path, Icon, isLive }) => {
        const isActive =
          pathname === path ||
          (path !== '/f1' && path !== '/tennis' && pathname.startsWith(path + '/'));
        const liveColor = 'var(--danger)';
        const color = isActive ? (isLive ? liveColor : activeColor) : 'var(--mute)';

        return (
          <Link
            key={key}
            to={path}
            style={{
              flexShrink: 0,
              padding: '0 14px',
              display: 'flex', alignItems: 'center', gap: 5,
              borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
              textDecoration: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              color,
              whiteSpace: 'nowrap',
              transition: 'color .12s',
            }}
          >
            {Icon && <Icon size={13} />}
            {label}
          </Link>
        );
      })}
    </div>
  );
}
