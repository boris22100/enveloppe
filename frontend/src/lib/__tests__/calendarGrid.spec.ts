import { describe, expect, it } from 'vitest';
import {
  computeDropReschedule,
  DAY_HOURS,
  filterEventsForHalfHour,
  filterEventsForHour,
  HALF_HOUR_SLOTS,
  normalizeSlotTime
} from '../calendarGrid';
import type { JSCalendarEvent } from '../jmap/calendar';

const sampleEvents: JSCalendarEvent[] = [
  { id: '1', title: 'Point matinal', start: '2026-11-27T08:00:00' },
  { id: '2', title: 'Revue technique', start: '2026-11-27T08:30:00' },
  { id: '3', title: 'Déjeuner', start: '2026-11-27T12:00:00' },
  { id: '4', title: 'Veille nocturne', start: '2026-11-27T23:30:00' },
  { id: '5', title: 'Anniversaire', start: '2026-11-27T00:00:00', showWithoutTime: true }
];

describe('calendarGrid — découpage 24h (30 min / 1 h)', () => {
  it('génère 24 heures (00 à 23) et 48 créneaux de 30 minutes (00:00 à 23:30)', () => {
    expect(DAY_HOURS).toHaveLength(24);
    expect(DAY_HOURS[0]).toBe(0);
    expect(DAY_HOURS[23]).toBe(23);

    expect(HALF_HOUR_SLOTS).toHaveLength(48);
    expect(HALF_HOUR_SLOTS[0]).toBe('00:00');
    expect(HALF_HOUR_SLOTS[1]).toBe('00:30');
    expect(HALF_HOUR_SLOTS[16]).toBe('08:00');
    expect(HALF_HOUR_SLOTS[17]).toBe('08:30');
    expect(HALF_HOUR_SLOTS[47]).toBe('23:30');
  });

  it('filtre correctement les événements par heure en vue semaine et exclut showWithoutTime', () => {
    const h08 = filterEventsForHour(sampleEvents, '08');
    expect(h08.map((e) => e.id)).toEqual(['1', '2']);

    const h00 = filterEventsForHour(sampleEvents, '00');
    expect(h00).toEqual([]);
  });

  it('filtre précisément les créneaux de 30 minutes en vue jour', () => {
    expect(filterEventsForHalfHour(sampleEvents, '08:00').map((e) => e.id)).toEqual(['1']);
    expect(filterEventsForHalfHour(sampleEvents, '08:30').map((e) => e.id)).toEqual(['2']);
    expect(filterEventsForHalfHour(sampleEvents, '23:30').map((e) => e.id)).toEqual(['4']);
    expect(normalizeSlotTime('9')).toBe('09:00');
    expect(normalizeSlotTime('14:30')).toBe('14:30');
  });
});

describe('calendarGrid — calcul de glisser-déposer', () => {
  it('calcule un déplacement vers un autre jour et une demi-heure précise avec incrément de séquence', () => {
    const res = computeDropReschedule(
      { start: '2026-11-27T08:00:00', sequence: 2 },
      '2026-11-30',
      '15:30'
    );

    expect(res).toEqual({
      changed: true,
      nextStartLocal: '2026-11-30T15:30',
      nextStartJmap: '2026-11-30T15:30:00',
      nextSequence: 3
    });
  });

  it('conserve l’heure existante si seul le jour cible est fourni, et marque changed=false si identique', () => {
    const movedDay = computeDropReschedule(
      { start: '2026-11-27T10:30:00' },
      '2026-11-28'
    );
    expect(movedDay.changed).toBe(true);
    expect(movedDay.nextStartJmap).toBe('2026-11-28T10:30:00');
    expect(movedDay.nextSequence).toBe(1);

    const sameSlot = computeDropReschedule(
      { start: '2026-11-27T10:30:00', sequence: 1 },
      '2026-11-27',
      '10:30'
    );
    expect(sameSlot.changed).toBe(false);
  });
});
