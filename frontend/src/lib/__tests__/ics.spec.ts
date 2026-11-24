import { describe, it, expect } from 'vitest';
import { buildIcsInvitation } from '../ics';

describe('buildIcsInvitation', () => {
  it('génère une invitation METHOD:REQUEST valide', () => {
    const ics = buildIcsInvitation({
      title: 'Réunion équipe',
      start: '2026-11-25T14:00:00.000Z',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr']
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('SUMMARY:Réunion équipe');
  });

  it('génère une annulation METHOD:CANCEL valide', () => {
    const ics = buildIcsInvitation({
      title: 'Réunion équipe',
      start: '2026-11-25T14:00:00.000Z',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr'],
      method: 'CANCEL'
    });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });
});
