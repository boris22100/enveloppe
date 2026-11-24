export type ThemeMode = 'bowiz' | 'dark' | 'light';

const THEME_KEY = 'enveloppe_theme';

export function getSavedTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'bowiz';
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'abysses' || saved === 'bowiz') return 'bowiz';
  if (saved === 'dark' || saved === 'light') return saved;
  return 'bowiz';
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
}
