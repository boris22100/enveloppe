import { describe, it, expect } from 'vitest';
import {
  CALENDAR_VIEW_STORAGE_KEY,
  loadCalendarView,
  saveCalendarView
} from '../calendarViewStorage';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    }
  };
}

describe('calendarViewStorage', () => {
  it('retourne "month" par défaut lorsque la clé est absente ou invalide', () => {
    const empty = createMemoryStorage();
    expect(loadCalendarView(empty)).toBe('month');

    const invalid = createMemoryStorage({ [CALENDAR_VIEW_STORAGE_KEY]: 'year' });
    expect(loadCalendarView(invalid)).toBe('month');
  });

  it('persiste et recharge "week" et "day" sous la clé enveloppe_calendar_view_v1', () => {
    const mem = createMemoryStorage();
    saveCalendarView('week', mem);
    expect(mem.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('week');
    expect(loadCalendarView(mem)).toBe('week');

    saveCalendarView('day', mem);
    expect(mem.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('day');
    expect(loadCalendarView(mem)).toBe('day');
  });

  it('ignore proprement les erreurs de stockage', () => {
    const throwingStorage = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      }
    };
    expect(() => saveCalendarView('day', throwingStorage)).not.toThrow();
    expect(loadCalendarView(throwingStorage)).toBe('month');
  });
});
