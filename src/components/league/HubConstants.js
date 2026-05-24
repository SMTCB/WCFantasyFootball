// Leaf module: pure constants and tiny helpers with no React imports.
// Keeping these separate from HubShared.jsx prevents Rolldown TDZ crashes
// when the same string constants are needed by both LeagueScreen (depth 1)
// and its child panels (depth 2+). Function declarations in HubShared.jsx
// are hoisted and safe; const declarations are not.

export const MONO    = "'JetBrains Mono', monospace";
export const DISPLAY = "'Archivo Black', sans-serif";
export const BODY    = "'Archivo', sans-serif";

export const mgrMono = (username = '') => username.substring(0, 3).toUpperCase() || '???';

export const miniBtnStyle = (color) => ({
  background: 'none', border: `1px solid ${color}44`, color,
  fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
  padding: '4px 10px', cursor: 'pointer', borderRadius: 2,
  textTransform: 'uppercase',
});

// Deterministic hue for a manager badge from their user_id string.
export function mgrHue(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
  const hue = h % 360;
  return `hsl(${hue},55%,62%)`;
}
