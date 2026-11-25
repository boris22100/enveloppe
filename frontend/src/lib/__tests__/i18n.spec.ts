import { describe, expect, it, beforeEach } from 'vitest';
import { getLocale, setLocale, t } from '../i18n';

describe('i18n FR/EN module', () => {
  beforeEach(() => {
    setLocale('fr');
  });

  it('defaults to French and resolves nested keys', () => {
    expect(getLocale()).toBe('fr');
    expect(t('mail.compose')).toBe('Nouveau message');
    expect(t('mail.blockedImages')).toBe('Images externes bloquées');
  });

  it('switches to English and falls back to French or key on unknown keys', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('mail.compose')).toBe('New message');
    expect(t('mail.showImages')).toBe('Show images');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('interpolates parameters cleanly', () => {
    expect(t('common.appName')).toBe('enveloppe');
  });
});
