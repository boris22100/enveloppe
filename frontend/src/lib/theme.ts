export type ThemeMode = 'abysses' | 'dark' | 'light';

export function getSavedTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'abysses';
  const v = localStorage.getItem('enveloppe_theme');
  return v === 'dark' || v === 'light' || v === 'abysses' ? v : 'abysses';
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-abysses', 'theme-dark', 'theme-light', 'dark');
  root.classList.add('theme-' + mode);
  if (mode !== 'light') root.classList.add('dark');
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('enveloppe_theme', mode);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', mode === 'light' ? '#F1F5F9' : mode === 'dark' ? '#11161F' : '#0D1B2A');
  }
}
