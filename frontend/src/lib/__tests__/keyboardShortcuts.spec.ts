import { describe, expect, it } from 'vitest';
import { computeNextSelectionIndex, resolveMailShortcut, type ShortcutContext } from '../keyboardShortcuts';

const baseCtx: ShortcutContext = {
  activeTab: 'mail',
  isEditableTarget: false,
  showShortcutsModal: false,
  hasBlockedModal: false,
  hasSelectedEmail: true
};

describe('keyboardShortcuts — résolution des raccourcis', () => {
  it('résout j/k, r, e, / et ? hors champ de saisie', () => {
    expect(resolveMailShortcut({ key: 'j' }, baseCtx)).toEqual({ type: 'select-next' });
    expect(resolveMailShortcut({ key: 'k' }, baseCtx)).toEqual({ type: 'select-prev' });
    expect(resolveMailShortcut({ key: 'r', shiftKey: false }, baseCtx)).toEqual({ type: 'reply', all: false });
    expect(resolveMailShortcut({ key: 'e' }, baseCtx)).toEqual({ type: 'archive' });
    expect(resolveMailShortcut({ key: '/' }, baseCtx)).toEqual({ type: 'focus-search' });
    expect(resolveMailShortcut({ key: '?' }, baseCtx)).toEqual({ type: 'toggle-help' });
  });

  it('ignore les raccourcis dans un champ éditable sauf ? ou Escape dans l’aide', () => {
    expect(resolveMailShortcut({ key: 'j' }, { ...baseCtx, isEditableTarget: true })).toBeNull();
    expect(resolveMailShortcut({ key: '/' }, { ...baseCtx, isEditableTarget: true })).toBeNull();
    expect(resolveMailShortcut({ key: '?' }, { ...baseCtx, isEditableTarget: true })).toBeNull();

    const modalCtx: ShortcutContext = { ...baseCtx, showShortcutsModal: true };
    expect(resolveMailShortcut({ key: 'j' }, modalCtx)).toBeNull();
    expect(resolveMailShortcut({ key: 'Escape' }, modalCtx)).toEqual({ type: 'close-help' });
  });

  it('bloque les actions liées à un message si aucun message n’est sélectionné ou hors onglet mail', () => {
    expect(resolveMailShortcut({ key: 'r' }, { ...baseCtx, hasSelectedEmail: false })).toBeNull();
    expect(resolveMailShortcut({ key: 'e' }, { ...baseCtx, hasSelectedEmail: false })).toBeNull();
    expect(resolveMailShortcut({ key: 'j' }, { ...baseCtx, activeTab: 'calendar' })).toBeNull();
  });

  it('calcule l’index suivant/précédent avec bornes', () => {
    expect(computeNextSelectionIndex(4, -1, 1)).toBe(0);
    expect(computeNextSelectionIndex(4, -1, -1)).toBe(3);
    expect(computeNextSelectionIndex(4, 0, -1)).toBe(0);
    expect(computeNextSelectionIndex(4, 3, 1)).toBe(3);
    expect(computeNextSelectionIndex(0, -1, 1)).toBe(-1);
  });
});
