import { describe, it, expect } from 'vitest';
import { buildIcsInvitation } from '../ics';

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
  });

  it('génère une annulation METHOD:CANCEL avec séquence personnalisée', () => {
    const ics = buildIcsInvitation({
      title: 'Point technique',
      start: '2026-11-25T10:00:00.000Z',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr'],
      method: 'CANCEL',
      sequence: 3
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:3');
  });
});
