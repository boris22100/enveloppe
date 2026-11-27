export const DRAFT_SAVE_DEBOUNCE_MS = 2000;

export type DraftSavePhase = 'idle' | 'saving' | 'saved';

export interface DraftFields {
  to: string;
  subject: string;
  text: string;
}

export interface DraftDebounceHooks {
  onSyncRemote?: (fields: DraftFields) => Promise<void> | void;
  delayMs?: number;
}

export function hasDraftContent(fields: DraftFields): boolean {
  return Boolean(fields.to.trim() || fields.subject.trim() || fields.text.trim());
}

export function createDraftDebounceController(
  onSaveComplete: () => void,
  delayOrHooks: number | DraftDebounceHooks = DRAFT_SAVE_DEBOUNCE_MS
) {
  const delayMs =
    typeof delayOrHooks === 'number' ? delayOrHooks : (delayOrHooks.delayMs ?? DRAFT_SAVE_DEBOUNCE_MS);
  const onSyncRemote = typeof delayOrHooks === 'number' ? undefined : delayOrHooks.onSyncRemote;

  let phase: DraftSavePhase = 'idle';
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(fields: DraftFields, active: boolean): DraftSavePhase {
    if (!active || !hasDraftContent(fields)) {
      return phase;
    }
    phase = 'saving';
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      phase = 'saved';
      try {
        const res = onSyncRemote?.(fields);
        if (res && typeof (res as Promise<void>).catch === 'function') {
          void (res as Promise<void>).catch(() => {});
        }
      } catch {
        // ignore sync errors
      }
      onSaveComplete();
    }, delayMs);
    return phase;
  }

  function cancel(): void {
    clearTimer();
  }

  function reset(): DraftSavePhase {
    clearTimer();
    phase = 'idle';
    return phase;
  }

  return {
    getPhase: () => phase,
    schedule,
    cancel,
    reset
  };
}
