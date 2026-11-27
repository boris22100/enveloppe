import { describe, expect, it } from 'vitest';
import { computeNextSelectionIndex, expandCheckedIds, resolveMailShortcut } from '../keyboardShortcuts';

describe('keyboardShortcuts — navigation, sélection x / Shift+J / Shift+K et actions', () => {
  const baseCtx = {
    activeTab: 'mail',
    isEditableTarget: false,
    showShortcutsModal: false,
    hasBlockedModal: false,
    hasSelectedEmail: true
  };

  it('résout x, Shift+J et Shift+K en vue messagerie', () => {
    expect(resolveMailShortcut({ key: 'x' }, baseCtx)).toEqual({ type: 'toggle-check' });
    expect(resolveMailShortcut({ key: 'J', shiftKey: true }, baseCtx)).toEqual({ type: 'extend-select-next' });
    expect(resolveMailShortcut({ key: 'K', shiftKey: true }, baseCtx)).toEqual({ type: 'extend-select-prev' });
    expect(resolveMailShortcut({ key: 'j' }, baseCtx)).toEqual({ type: 'select-next' });
    expect(resolveMailShortcut({ key: 'k' }, baseCtx)).toEqual({ type: 'select-prev' });
  });

  it('étend la sélection multiple sur un intervalle d’identifiants', () => {
    const ids = ['m0', 'm1', 'm2', 'm3', 'm4'];
    const expanded = expandCheckedIds(ids, ['m0'], 1, 3);
    expect([...expanded]).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(computeNextSelectionIndex(5, 1, 1)).toBe(2);
    expect(computeNextSelectionIndex(5, 0, -1)).toBe(0);
  });
});
