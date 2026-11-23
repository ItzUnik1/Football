export interface Settings { text: 'normal' | 'large' | 'xl'; theme: 'dark' | 'light'; colorblind: boolean; reduceMotion: boolean }
export const DEFAULT_SETTINGS: Settings = { text: 'normal', theme: 'dark', colorblind: false, reduceMotion: false };
const KEY = 'touchline.settings';
const ZOOM = { normal: 1, large: 1.15, xl: 1.3 } as const;

export function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

/** Applies display settings to the document through data attributes and CSS variables. */
export function applySettings(s: Settings): void {
  const el = document.documentElement;
  el.dataset.theme = s.theme;
  el.dataset.cb = s.colorblind ? '1' : '0';
  el.dataset.motion = s.reduceMotion ? 'reduce' : 'full';
  el.style.setProperty('--z', String(ZOOM[s.text]));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', s.theme === 'light' ? '#eef2f7' : '#0b0f17');
}
