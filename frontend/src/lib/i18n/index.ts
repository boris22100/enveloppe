import { fr, type TranslationDictionary } from './fr';
import { en } from './en';

export type Locale = 'fr' | 'en';

const STORAGE_KEY = 'enveloppe_lang';
const dictionaries: Record<Locale, TranslationDictionary> = { fr, en };
const listeners = new Set<(locale: Locale) => void>();

function detectInitialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'fr';
}

function applyDocumentLang(locale: Locale): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = locale;
  }
}

let currentLocale: Locale = detectInitialLocale();
applyDocumentLang(currentLocale);

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, locale);
  }
  applyDocumentLang(locale);
  for (const fn of listeners) {
    fn(currentLocale);
  }
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resolvePath(dict: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = dict;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function t(key: string, params?: Record<string, string | number>, locale: Locale = currentLocale): string {
  const raw =
    resolvePath(dictionaries[locale], key) ??
    resolvePath(dictionaries.fr, key) ??
    key;

  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, token: string) =>
    token in params ? String(params[token]) : `{${token}}`
  );
}

export { fr, en };
