import type { JSContact } from '../jmap/contacts';
import type { JSCalendarEvent } from '../jmap/calendar';

export function contactsToVcf(contacts: JSContact[]): string {
  return contacts.map((c) => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name?.full || 'Sans nom'}`];
    Object.values(c.emails ?? {}).forEach((e) => lines.push(`EMAIL:${e.address}`));
    Object.values(c.phones ?? {}).forEach((p) => lines.push(`TEL:${p.number}`));
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }).join('\r\n');
}

export function vcfToContacts(vcf: string): any[] {
  const blocks = vcf.split(/BEGIN:VCARD/i).slice(1);
  return blocks.map((block) => {
    const fn = block.match(/^FN[^:]*:(.*)$/im)?.[1]?.trim() || 'Sans nom';
    const email = block.match(/^EMAIL[^:]*:(.*)$/im)?.[1]?.trim();
    const tel = block.match(/^TEL[^:]*:(.*)$/im)?.[1]?.trim();
    const card: any = { '@type': 'Card', version: '1.0', name: { full: fn } };
    if (email) card.emails = { e1: { '@type': 'EmailAddress', address: email } };
    if (tel) card.phones = { p1: { '@type': 'Phone', number: tel } };
    return card;
  });
}

function toIcsDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15);
}

function fromIcsDate(ics: string): string {
  const clean = ics.trim().replace(/Z$/, '');
  if (clean.length >= 15) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  }
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T09:00:00`;
  }
  return new Date().toISOString().slice(0, 19);
}

export function eventsToIcs(events: JSCalendarEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JMAP Pulse//FR'];
  events.forEach((ev, idx) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id || `ev-${idx}@jmap-pulse`}`);
    lines.push(`SUMMARY:${ev.title || 'Événement'}`);
    lines.push(`DTSTART:${toIcsDate(ev.start)}`);
    if (ev.description) lines.push(`DESCRIPTION:${ev.description.replace(/\n/g, '\\n')}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function icsToEvents(ics: string): any[] {
  const blocks = ics.split(/BEGIN:VEVENT/i).slice(1);
  return blocks.map((block) => {
    const title = block.match(/^SUMMARY[^:]*:(.*)$/im)?.[1]?.trim() || 'Événement';
    const dtstart = block.match(/^DTSTART[^:]*:(.*)$/im)?.[1]?.trim() || '';
    const desc = block.match(/^DESCRIPTION[^:]*:(.*)$/im)?.[1]?.trim() || '';
    return {
      '@type': 'Event',
      title,
      start: fromIcsDate(dtstart),
      duration: 'PT1H',
      description: desc.replace(/\\n/g, '\n')
    };
  });
}
