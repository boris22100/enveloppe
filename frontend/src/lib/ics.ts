export interface CalendarInviteInput {
  uid?: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  description?: string;
  organizerEmail: string;
  organizerName?: string;
  attendees: string[];
  method?: 'REQUEST' | 'CANCEL';
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsUtc(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcsInvitation(input: CalendarInviteInput): string {
  const uid = input.uid || `enveloppe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@jmap`;
  const dtStamp = toIcsUtc(new Date().toISOString());
  const dtStart = toIcsUtc(input.start);
  const startMs = new Date(input.start).getTime();
  const fallbackEnd = Number.isNaN(startMs)
    ? new Date(Date.now() + 3600_000).toISOString()
    : new Date(startMs + 3600_000).toISOString();
  const dtEnd = toIcsUtc(input.end || fallbackEnd);

  const method = input.method || 'REQUEST';
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  const seq = method === 'CANCEL' ? '1' : '0';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Enveloppe by BoWiz//JMAP Calendar//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.title || 'Événement')}`
  ];

  if (input.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(input.location.trim())}`);
  }
  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description.trim())}`);
  }
  if (input.organizerEmail?.trim()) {
    const cn = input.organizerName ? `;CN=${escapeIcsText(input.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail.trim()}`);
  }

  for (const att of input.attendees) {
    const clean = att.trim();
    if (clean) {
      lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${escapeIcsText(clean)}:mailto:${clean}`);
    }
  }

  lines.push(`STATUS:${status}`, `SEQUENCE:${seq}`, 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function createIcsFile(icsContent: string, filename = 'invitation.ics'): File {
  return new File([icsContent], filename, { type: 'text/calendar; charset=utf-8; method=REQUEST' });
}
