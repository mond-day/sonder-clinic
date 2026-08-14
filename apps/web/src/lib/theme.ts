export const THEME_STORAGE_KEY = 'sonder.theme';

export type ColorTheme = 'light' | 'dark';

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === 'light' || value === 'dark';
}

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var t=s==='dark'||s==='light'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
