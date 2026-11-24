import { describe, it, expect } from 'vitest';
import { buildIcsInvitation } from '../ics';

describe('buildIcsInvitation', () => {
  it('génère une invitation METHOD:REQUEST valide', () => {
    const ics = buildIcsInvitation({
      title: 'Point technique',
      start: '2026-11-25T10:00:00.000Z',
      organizerEmail: 'boris@mallach.fr',
      attendees: ['alice@exemple.fr']
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('SUMMARY:Point technique');
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
