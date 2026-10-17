// Light/dark theme. Chosen in Settings → Appearance (stored in localStorage); `?theme=dark|light`
// also sets and remembers it. With nothing stored the app stays light regardless of the OS setting.
const KEY = 'ffl-theme';

export function getStoredTheme() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  return t;
}

export function initTheme() {
  let t = getStoredTheme();
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (q === 'dark' || q === 'light') {
      t = q;
      localStorage.setItem(KEY, q);
    }
  } catch { /* storage unavailable — stay on default */ }
  return applyTheme(t);
}

export function setTheme(theme) {
  const t = applyTheme(theme);
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable — applies for this session only */ }
  return t;
}
