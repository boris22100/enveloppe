import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDraftDebounceController,
  DRAFT_SAVE_DEBOUNCE_MS,
  hasDraftContent
} from '../draftDebounce';

describe('draftDebounce — état de sauvegarde sur 2s', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('détecte si un brouillon contient du texte utile', () => {
    expect(hasDraftContent({ to: '   ', subject: '', text: '\n' })).toBe(false);
    expect(hasDraftContent({ to: 'alice@exemple.fr', subject: '', text: '' })).toBe(true);
    expect(hasDraftContent({ to: '', subject: 'Sujet', text: '' })).toBe(true);
  });

  it('passe en saving puis saved après 2000 ms', () => {
    const onSaved = vi.fn();
    const ctrl = createDraftDebounceController(onSaved);

    const phase = ctrl.schedule({ to: 'bob@exemple.fr', subject: 'Test', text: 'Bonjour' }, true);
    expect(phase).toBe('saving');
    expect(ctrl.getPhase()).toBe('saving');

    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS - 1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(ctrl.getPhase()).toBe('saving');

    vi.advanceTimersByTime(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(ctrl.getPhase()).toBe('saved');
  });

  it('réinitialise le minuteur de 2s lors de frappes successives', () => {
    const onSaved = vi.fn();
    const ctrl = createDraftDebounceController(onSaved);

    ctrl.schedule({ to: 'bob@exemple.fr', subject: 'V1', text: 'A' }, true);
    vi.advanceTimersByTime(1400);

    ctrl.schedule({ to: 'bob@exemple.fr', subject: 'V2', text: 'AB' }, true);
    vi.advanceTimersByTime(1400);
    expect(onSaved).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(ctrl.getPhase()).toBe('saved');
  });
});
