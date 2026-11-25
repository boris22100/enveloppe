import { describe, expect, it } from 'vitest';
import { expandEventOccurrences, type JSCalendarEvent } from '../jmap/calendar';

describe('JSCalendar recurrence expansion', () => {
  it('expands yearly occurrences across a multi-year window', () => {
    const ev: JSCalendarEvent = {
      id: 'bday-1',
      title: 'Anniversaire',
      start: '2024-05-12T00:00:00',
      recurrenceRules: [{ frequency: 'yearly' }]
    };
    const items = expandEventOccurrences(ev, '2025-01-01T00:00:00', '2027-12-31T23:59:59');
    expect(items.map((x) => x.start.slice(0, 10))).toEqual(['2025-05-12', '2026-05-12', '2027-05-12']);
  });

  it('respects count and recurrenceOverrides exclusions', () => {
    const ev: JSCalendarEvent = {
      id: 'standup-1',
      title: 'Point quotidien',
      start: '2026-11-02T09:00:00',
      recurrenceRules: [{ frequency: 'daily', count: 4 }],
      recurrenceOverrides: {
        '2026-11-04': { excluded: true }
      }
    };
    const items = expandEventOccurrences(ev, '2026-11-01T00:00:00', '2026-11-10T23:59:59');
    expect(items.map((x) => x.start.slice(0, 10))).toEqual(['2026-11-02', '2026-11-03', '2026-11-05']);
  });

  it('expands weekly recurrence with custom interval', () => {
    const ev: JSCalendarEvent = {
      id: 'biweekly-1',
      title: 'Revue bi-hebdo',
      start: '2026-11-02T14:00:00',
      recurrenceRules: [{ frequency: 'weekly', interval: 2, count: 3 }]
    };
    const items = expandEventOccurrences(ev, '2026-11-01T00:00:00', '2026-12-15T23:59:59');
    expect(items.map((x) => x.start.slice(0, 10))).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });
});
