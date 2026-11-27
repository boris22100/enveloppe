export const UNDO_SEND_DELAY_MS = 5000;

export interface PendingSendJob<T> {
  id: string;
  payload: T;
  createdAt: number;
  expiresAt: number;
}

export function createUndoSendQueue<T>(
  onCommit: (payload: T) => Promise<void> | void,
  delayMs = UNDO_SEND_DELAY_MS
) {
  let current: PendingSendJob<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(id: string, payload: T): PendingSendJob<T> {
    clearTimer();
    const now = Date.now();
    const job: PendingSendJob<T> = {
      id,
      payload,
      createdAt: now,
      expiresAt: now + delayMs
    };
    current = job;
    timer = setTimeout(() => {
      timer = null;
      const pending = current;
      current = null;
      if (!pending) return;
      try {
        const res = onCommit(pending.payload);
        if (res && typeof (res as Promise<void>).catch === 'function') {
          void (res as Promise<void>).catch(() => {});
        }
      } catch {
        // ignore commit error
      }
    }, delayMs);
    return job;
  }

  function cancel(id?: string): boolean {
    if (!current) return false;
    if (id && current.id !== id) return false;
    clearTimer();
    current = null;
    return true;
  }

  async function flushNow(): Promise<boolean> {
    if (!current) return false;
    clearTimer();
    const pending = current;
    current = null;
    await onCommit(pending.payload);
    return true;
  }

  return {
    getPending: () => current,
    schedule,
    cancel,
    flushNow
  };
}
