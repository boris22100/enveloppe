import { describe, expect, it, vi } from 'vitest';
import { createOutboxStore } from '../outbox';

describe('outbox offline queue', () => {
  it('enqueues entries and flushes them in order when executor succeeds', async () => {
    const store = createOutboxStore<{ to: string }>('test.outbox.success');
    store.enqueue('send_email', { to: 'alice@example.org' });
    store.enqueue('send_email', { to: 'bob@example.org' });
    expect(store.list()).toHaveLength(2);

    const seen: string[] = [];
    const res = await store.flush(async (entry) => {
      seen.push(entry.payload.to);
    });

    expect(res).toEqual({ processed: 2, remaining: 0 });
    expect(seen).toEqual(['alice@example.org', 'bob@example.org']);
    expect(store.list()).toHaveLength(0);
  });

  it('preserves remaining items when network fails mid-flush', async () => {
    const store = createOutboxStore<{ id: number }>('test.outbox.retry');
    store.enqueue('mark_read', { id: 1 });
    store.enqueue('mark_read', { id: 2 });

    const exec = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'));

    const res = await store.flush(exec);
    expect(res).toEqual({ processed: 1, remaining: 1 });
    expect(store.list()[0]?.payload.id).toBe(2);
  });
});
