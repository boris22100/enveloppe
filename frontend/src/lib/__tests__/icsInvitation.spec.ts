import { describe, expect, it } from 'vitest';
import {
  buildIcsReply,
  normalizeIcsTimeZone,
  parseIcsDateToLocal,
  parseIcsInvitation
} from '../jmap/calendar';

describe('parseIcsInvitation, TZID, participants, EXDATE et réponses rapides', () => {
  it('parse un événement VEVENT complet avec ORGANIZER, ATTENDEE, DTEND;TZID et EXDATE', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:evt-99',
      'DTSTART;TZID=Europe/Paris:20260701T120000',
      'DTEND;TZID=Europe/Paris:20260701T133000',
      'EXDATE;TZID=Europe/Paris:20260708T120000',
      'SUMMARY:Synchronisation technique',
      'LOCATION:Salle Rance',
      'ORGANIZER;CN="Alice Martin":mailto:alice@example.org',
      'ATTENDEE;CN="Boris";PARTSTAT=ACCEPTED:mailto:boris@mallach.fr',
      'ATTENDEE;PARTSTAT=DECLINED:mailto:bob@example.org',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const parsed = parseIcsInvitation(ics);
    expect(parsed).not.toBeNull();
    expect(parsed?.uid).toBe('evt-99');
    expect(parsed?.organizerEmail).toBe('alice@example.org');
    expect(parsed?.organizerName).toBe('Alice Martin');
    expect(parsed?.attendees).toHaveLength(2);
    expect(parsed?.attendees[0].partstat).toBe('ACCEPTED');
    expect(parsed?.attendees[1].partstat).toBe('DECLINED');
    expect(parsed?.exdates).toHaveLength(1);
    expect(parsed?.end).toBeDefined();
  });

  it('normalise les fuseaux TZID (y compris alias Windows) et génère METHOD:REPLY', () => {
    expect(normalizeIcsTimeZone('Europe/Paris')).toBe('Europe/Paris');
    expect(normalizeIcsTimeZone('Romance Standard Time')).toBe('Europe/Paris');
    expect(normalizeIcsTimeZone('Invalid/Zone')).toBeNull();

    const sample = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:u1\r\nSUMMARY:Test\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(buildIcsReply(sample, 'accepted')).toContain('PARTSTAT=ACCEPTED');
    expect(buildIcsReply(sample, 'tentative')).toContain('PARTSTAT=TENTATIVE');
    expect(buildIcsReply(sample, 'declined')).toContain('PARTSTAT=DECLINED');
    expect(parseIcsInvitation('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeNull();
  });
});
