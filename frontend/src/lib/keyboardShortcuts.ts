export type MailShortcutAction =
  | { type: 'toggle-help' }
  | { type: 'close-help' }
  | { type: 'focus-search' }
  | { type: 'select-next' }
  | { type: 'select-prev' }
  | { type: 'compose' }
  | { type: 'archive' }
  | { type: 'reply'; all: boolean }
  | { type: 'reply-all' }
  | { type: 'forward' }
  | { type: 'delete' };

export interface ShortcutContext {
  activeTab: string;
  isEditableTarget: boolean;
  showShortcutsModal: boolean;
  hasBlockedModal: boolean;
  hasSelectedEmail: boolean;
}

export function resolveMailShortcut(
  input: { key: string; shiftKey?: boolean },
  ctx: ShortcutContext
): MailShortcutAction | null {
  if (input.key === '?' && !ctx.isEditableTarget) {
    return { type: 'toggle-help' };
  }

  if (ctx.showShortcutsModal) {
    return input.key === 'Escape' ? { type: 'close-help' } : null;
  }

  if (ctx.hasBlockedModal || ctx.activeTab !== 'mail' || ctx.isEditableTarget) {
    return null;
  }

  if (input.key === '/') {
    return { type: 'focus-search' };
  }

  const k = input.key.toLowerCase();
  if (k === 'j') return { type: 'select-next' };
  if (k === 'k') return { type: 'select-prev' };
  if (k === 'c') return { type: 'compose' };
  if (k === 'e' && ctx.hasSelectedEmail) return { type: 'archive' };
  if (k === 'r' && ctx.hasSelectedEmail) return { type: 'reply', all: Boolean(input.shiftKey) };
  if (k === 'a' && ctx.hasSelectedEmail) return { type: 'reply-all' };
  if (k === 'f' && ctx.hasSelectedEmail) return { type: 'forward' };
  if (input.key === 'Delete' && ctx.hasSelectedEmail) return { type: 'delete' };

  return null;
}

export function computeNextSelectionIndex(
  length: number,
  currentIndex: number,
  delta: 1 | -1
): number {
  if (length <= 0) return -1;
  if (currentIndex < 0) {
    return delta > 0 ? 0 : length - 1;
  }
  return Math.min(length - 1, Math.max(0, currentIndex + delta));
}
