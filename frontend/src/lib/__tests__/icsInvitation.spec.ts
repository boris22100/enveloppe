import { describe, expect, it } from 'vitest';
import {
  buildIcsReply,
  normalizeIcsTimeZone,
  parseIcsDateToLocal,
  parseIcsInvitation
} from '../jmap/calendar';

describe('parseIcsInvitation, TZID et réponses rapides', () => {
  it('parse un événement VEVENT standard et génère une réponse METHOD:REPLY avec PARTSTAT', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:evt-42',
      'DTSTART:20261201T140000Z',
      'SUMMARY:Revue architecture',
      'LOCATION:Visio',
      'DESCRIPTION:Préparer la roadmap',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const parsed = parseIcsInvitation(ics);
    expect(parsed).not.toBeNull();
    expect(parsed?.uid).toBe('evt-42');
    expect(parsed?.title).toBe('Revue architecture');
    expect(parsed?.location).toBe('Visio');

    const reply = buildIcsReply(ics, 'accepted', 'boris@mallach.fr');
    expect(reply).toContain('METHOD:REPLY');
    expect(reply).toContain('PARTSTAT=ACCEPTED');
    expect(reply).toContain('UID:evt-42');
  });

  it('normalise les fuseaux TZID (y compris alias Windows) et convertit DTSTART;TZID', () => {
    expect(normalizeIcsTimeZone('Europe/Paris')).toBe('Europe/Paris');
    expect(normalizeIcsTimeZone('Romance Standard Time')).toBe('Europe/Paris');
    expect(normalizeIcsTimeZone('Invalid/Zone')).toBeNull();

    // 2026-07-01 en Europe/Paris (UTC+2) à 12:00 équivaut à 10:00 UTC
    const summerParis = parseIcsDateToLocal('DTSTART;TZID=Europe/Paris:20260701T120000');
    const expectedSummerUtc = new Date('2026-07-01T10:00:00Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    const expectedLocal = `${expectedSummerUtc.getFullYear()}-${pad(expectedSummerUtc.getMonth() + 1)}-${pad(expectedSummerUtc.getDate())}T${pad(expectedSummerUtc.getHours())}:${pad(expectedSummerUtc.getMinutes())}:${pad(expectedSummerUtc.getSeconds())}`;
    expect(summerParis).toBe(expectedLocal);
  });

  it('génère les trois statuts PARTSTAT (ACCEPTED, TENTATIVE, DECLINED) et retourne null si sans VEVENT', () => {
    const sample = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:u1\r\nSUMMARY:Test\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(buildIcsReply(sample, 'accepted')).toContain('PARTSTAT=ACCEPTED');
    expect(buildIcsReply(sample, 'tentative')).toContain('PARTSTAT=TENTATIVE');
    expect(buildIcsReply(sample, 'declined')).toContain('PARTSTAT=DECLINED');
    expect(parseIcsInvitation('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeNull();
  });
});
