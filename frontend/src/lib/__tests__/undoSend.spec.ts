import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUndoSendQueue, UNDO_SEND_DELAY_MS } from '../undoSend';

describe('createUndoSendQueue — annulation d’envoi différée', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exécute l’envoi après le délai par défaut si non annulé', () => {
    const commit = vi.fn();
    const queue = createUndoSendQueue<{ to: string }>(commit);

    queue.schedule('send-1', { to: 'alice@example.org' });
    expect(queue.getPending()?.id).toBe('send-1');

    vi.advanceTimersByTime(UNDO_SEND_DELAY_MS - 1);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ to: 'alice@example.org' });
    expect(queue.getPending()).toBeNull();
  });

  it('annule l’envoi sans appeler onCommit', () => {
    const commit = vi.fn();
    const queue = createUndoSendQueue<{ subject: string }>(commit, 3000);

    queue.schedule('send-2', { subject: 'Brouillon' });
    vi.advanceTimersByTime(1200);
    expect(queue.cancel('send-2')).toBe(true);
    expect(queue.getPending()).toBeNull();

    vi.advanceTimersByTime(3000);
    expect(commit).not.toHaveBeenCalled();
  });
});
