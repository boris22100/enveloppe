import { describe, expect, it } from 'vitest';
import { parseIcsInvitation } from '../jmap/calendar';

describe('parseIcsInvitation', () => {
  it('parse un VEVENT avec lignes repliées et horodatage UTC', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:meeting-2026-11-25@enveloppe.local',
      'SUMMARY:Revue technique JMAP',
      'DTSTART:20261126T093000Z',
      'LOCATION:Visio / Salle',
      '  Bretagne',
      'DESCRIPTION:Point v0.8.6\\nOrdre du jour complet',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const parsed = parseIcsInvitation(ics);
    expect(parsed).not.toBeNull();
    expect(parsed?.uid).toBe('meeting-2026-11-25@enveloppe.local');
    expect(parsed?.title).toBe('Revue technique JMAP');
    expect(parsed?.location).toBe('Visio / Salle Bretagne');
    expect(parsed?.description).toBe('Point v0.8.6\nOrdre du jour complet');
    expect(parsed?.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
  });

  it('parse un horodatage local sans suffixe Z', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Rendez-vous local',
      'DTSTART;TZID=Europe/Paris:20261201T140000',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n');

    const parsed = parseIcsInvitation(ics);
    expect(parsed?.title).toBe('Rendez-vous local');
    expect(parsed?.start).toBe('2026-12-01T14:00:00');
  });

  it('retourne null si aucun VEVENT n est présent', () => {
    expect(parseIcsInvitation('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeNull();
  });
});
