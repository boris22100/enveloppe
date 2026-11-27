export type MailShortcutAction =
  | { type: 'toggle-help' }
  | { type: 'close-help' }
  | { type: 'focus-search' }
  | { type: 'select-next' }
  | { type: 'select-prev' }
  | { type: 'toggle-check' }
  | { type: 'extend-select-next' }
  | { type: 'extend-select-prev' }
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
  if (k === 'j' && input.shiftKey) return { type: 'extend-select-next' };
  if (k === 'k' && input.shiftKey) return { type: 'extend-select-prev' };
  if (k === 'j') return { type: 'select-next' };
  if (k === 'k') return { type: 'select-prev' };
  if (k === 'x' && ctx.hasSelectedEmail) return { type: 'toggle-check' };
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

export function expandCheckedIds(
  ids: string[],
  currentChecked: Iterable<string>,
  fromIndex: number,
  toIndex: number
): Set<string> {
  const next = new Set(currentChecked);
  if (ids.length === 0 || fromIndex < 0 || toIndex < 0) return next;
  const start = Math.max(0, Math.min(fromIndex, toIndex));
  const end = Math.min(ids.length - 1, Math.max(fromIndex, toIndex));
  for (let i = start; i <= end; i++) {
    next.add(ids[i]);
  }
  return next;
}
