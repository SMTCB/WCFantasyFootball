// Light/dark theme. Wave 0 ships the tokens only: dark mode is not exposed in the UI until
// after Wave 2. `?theme=dark|light` previews it (and is remembered); with nothing stored the
// app stays light regardless of the OS setting.
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
