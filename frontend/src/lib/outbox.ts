export interface OutboxEntry<T = unknown> {
  id: string;
  kind: 'send_email' | 'bulk_archive' | 'mark_read';
  createdAt: number;
  payload: T;
}

export interface OutboxStore<T = unknown> {
  enqueue(kind: OutboxEntry<T>['kind'], payload: T): OutboxEntry<T>;
  list(): OutboxEntry<T>[];
  remove(id: string): void;
  flush(executor: (entry: OutboxEntry<T>) => Promise<void>): Promise<{ processed: number; remaining: number }>;
}

export function createOutboxStore<T = unknown>(storageKey = 'enveloppe.outbox.v1'): OutboxStore<T> {
  let memoryFallback: OutboxEntry<T>[] = [];

  function readAll(): OutboxEntry<T>[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // ignore storage errors
    }
    return [...memoryFallback];
  }

  function writeAll(items: OutboxEntry<T>[]) {
    memoryFallback = [...items];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(items));
      }
    } catch {
      // ignore storage quota errors
    }
  }

  return {
    enqueue(kind, payload) {
      const entry: OutboxEntry<T> = {
        id: `obx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        createdAt: Date.now(),
        payload
      };
      const next = [...readAll(), entry];
      writeAll(next);
      return entry;
    },
    list() {
      return readAll();
    },
    remove(id) {
      writeAll(readAll().filter((item) => item.id !== id));
    },
    async flush(executor) {
      const current = readAll();
      let processed = 0;
      for (const entry of current) {
        try {
          await executor(entry);
          this.remove(entry.id);
          processed += 1;
        } catch {
          // Stop flushing on first network/server error; preserve order
          break;
        }
      }
      return { processed, remaining: readAll().length };
    }
  };
}
