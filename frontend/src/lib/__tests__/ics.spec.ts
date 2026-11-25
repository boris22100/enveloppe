import { describe, it, expect } from 'vitest';
import { buildIcsInvitation, createIcsFile } from '../ics';

describe('buildIcsInvitation', () => {
  it('génère une invitation METHOD:REQUEST valide avec échappement RFC 5545', () => {
    const ics = buildIcsInvitation({
      title: 'Point, synthèse; équipe',
      start: '2026-11-25T10:00:00.000Z',
      end: '2026-11-25T11:00:00.000Z',
      location: 'Salle A, Bretagne',
      description: 'Ligne 1\nLigne 2',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr']
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('SUMMARY:Point\\, synthèse\\; équipe');
    expect(ics).toContain('LOCATION:Salle A\\, Bretagne');
    expect(ics).toContain('DESCRIPTION:Ligne 1\\nLigne 2');
    expect(ics).toContain('ORGANIZER:mailto:boris@mallach.fr');
    expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=alice@exemple.fr:mailto:alice@exemple.fr');
  });

  it('génère une mise à jour METHOD:REQUEST avec SEQUENCE incrémentée et fin par défaut (+1h)', () => {
    const ics = buildIcsInvitation({
      uid: 'evt-123@mallach.fr',
      title: 'Point technique mis à jour',
      start: '2026-11-26T09:00:00.000Z',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr', 'bob@exemple.fr'],
      method: 'REQUEST',
      sequence: 2
    });
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('UID:evt-123@mallach.fr');
    expect(ics).toContain('SEQUENCE:2');
    expect(ics).toContain('DTSTART:20261126T090000Z');
    expect(ics).toContain('DTEND:20261126T100000Z');
    expect(ics).toContain('mailto:alice@exemple.fr');
    expect(ics).toContain('mailto:bob@exemple.fr');
  });

  it('génère une annulation METHOD:CANCEL avec séquence personnalisée et UID conservé', () => {
    const ics = buildIcsInvitation({
      uid: 'evt-123@mallach.fr',
      title: 'Point technique',
      start: '2026-11-25T10:00:00.000Z',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr'],
      method: 'CANCEL',
      sequence: 3
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('UID:evt-123@mallach.fr');
    expect(ics).toContain('SEQUENCE:3');
  });

  it('crée un fichier File .ics avec le type MIME text/calendar', () => {
    const content = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
    const file = createIcsFile(content, 'update.ics');
    expect(file.name).toBe('update.ics');
    expect(file.type).toContain('text/calendar');
  });
});
