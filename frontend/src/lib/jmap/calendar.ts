import { getPrimaryAccountId, jmapCall } from './client';

const CAP = 'urn:ietf:params:jmap:calendars';

export type CalendarItemKind = 'event' | 'task' | 'birthday';

export interface JSCalendarRecurrenceRule {
  '@type'?: 'RecurrenceRule';
  frequency: 'yearly' | 'monthly' | 'weekly' | 'daily';
  interval?: number;
  count?: number;
  until?: string;
  byDay?: string[];
}

export interface JSCalendarEvent {
  id?: string;
  title: string;
  start: string;
  duration?: string;
  description?: string;
  showWithoutTime?: boolean;
  sequence?: number;
  categories?: Record<string, boolean>;
  participants?: Record<string, { email?: string; name?: string }>;
  calendarIds?: Record<string, boolean>;
  recurrenceRules?: JSCalendarRecurrenceRule[];
  recurrenceOverrides?: Record<string, Partial<JSCalendarEvent> & { excluded?: boolean }>;
  recurrenceId?: string;
  isOccurrence?: boolean;
}

export async function fetchEvents(accountId: string): Promise<{ defaultCalId: string; events: JSCalendarEvent[] }> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(accountId, [
    ['Calendar/get', { accountId: accId }, 'cal0'],
    ['CalendarEvent/get', { accountId: accId }, 'ev0']
  ], [CAP]);
  const cals = res.methodResponses[0][1].list ?? [];
  const defaultCalId = cals[0]?.id ?? '';
  return { defaultCalId, events: res.methodResponses[1][1].list ?? [] };
}

export async function createEvent(
  accountId: string,
  calendarId: string,
  title: string,
  startLocal: string,
  description = '',
  kind: CalendarItemKind = 'event',
  invitees: string[] = []
) {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const start = startLocal.length === 16 ? `${startLocal}:00` : startLocal;

  const payload: Record<string, any> = {
    '@type': 'Event',
    calendarIds: { [calendarId]: true },
    title,
    start,
    description
  };

  if (kind === 'event') {
    payload.duration = 'PT1H';
    if (invitees.length > 0) {
      const participants: Record<string, any> = {};
      invitees.forEach((raw, idx) => {
        const email = raw.trim();
        if (!email) return;
        participants[`p${idx + 1}`] = {
          '@type': 'Participant',
          email,
          sendTo: { imip: `mailto:${email}` },
          kind: 'individual',
          roles: { attendee: true },
          participationStatus: 'needs-action'
        };
      });
      if (Object.keys(participants).length > 0) {
        payload.participants = participants;
      }
    }
  } else if (kind === 'task') {
    payload.duration = 'PT30M';
    payload.categories = { Tâche: true };
  } else if (kind === 'birthday') {
    payload.showWithoutTime = true;
    payload.duration = 'P1D';
    payload.categories = { Anniversaire: true };
    payload.recurrenceRules = [{ '@type': 'RecurrenceRule', frequency: 'yearly' }];
  }

  await jmapCall(accountId, [[
    'CalendarEvent/set',
    { accountId: accId, create: { ev1: payload } },
    'ev0'
  ]], [CAP]);
}

export async function deleteEvent(accountId: string, eventId: string) {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(accountId, [['CalendarEvent/set', { accountId: accId, destroy: [eventId] }, 'evd0']], [CAP]);
  const result = res.methodResponses?.[0]?.[1];
  if (result?.notDestroyed?.[eventId]) {
    throw new Error(result.notDestroyed[eventId].description || "Suppression de l'événement refusée");
  }
}

export async function importEventsJSON(accountId: string, calendarId: string, jsonText: string) {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const items = JSON.parse(jsonText) as any[];
  const create: Record<string, any> = {};
  items.forEach((item, idx) => {
    const { id, uid, ...clean } = item;
    create[`ev_${idx}`] = { '@type': 'Event', calendarIds: { [calendarId]: true }, ...clean };
  });
  await jmapCall(accountId, [['CalendarEvent/set', { accountId: accId, create }, 'imp0']], [CAP]);
}

export async function updateEvent(
  accountId: string,
  eventId: string,
  patch: Partial<Pick<JSCalendarEvent, 'title' | 'start' | 'description' | 'showWithoutTime' | 'categories' | 'sequence' | 'participants'>> & { end?: string }
) {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const cleanPatch: Record<string, any> = { ...patch };
  if (typeof cleanPatch.start === 'string' && cleanPatch.start.length === 16) {
    cleanPatch.start = `${cleanPatch.start}:00`;
  }
  const res = await jmapCall(accountId, [
    ['CalendarEvent/set', { accountId: accId, update: { [eventId]: cleanPatch } }, 'u0']
  ], [CAP]);
  const result = res.methodResponses?.[0]?.[1];
  if (result?.notUpdated?.[eventId]) {
    throw new Error(result.notUpdated[eventId].description || "Mise à jour de l'événement refusée");
  }
}


function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function addFrequencyStep(base: Date, freq: JSCalendarRecurrenceRule['frequency'], interval: number, stepIndex: number): Date {
  const d = new Date(base.getTime());
  const total = stepIndex * Math.max(1, interval);
  if (freq === 'daily') {
    d.setDate(d.getDate() + total);
  } else if (freq === 'weekly') {
    d.setDate(d.getDate() + total * 7);
  } else if (freq === 'monthly') {
    d.setMonth(d.getMonth() + total);
  } else {
    d.setFullYear(d.getFullYear() + total);
  }
  return d;
}

export function expandEventOccurrences(
  ev: JSCalendarEvent,
  windowStartIso: string,
  windowEndIso: string
): JSCalendarEvent[] {
  if (!ev.start) return [];
  const startDate = new Date(ev.start);
  if (Number.isNaN(startDate.getTime())) return [ev];

  const rules = ev.recurrenceRules ?? [];
  if (rules.length === 0) {
    return [ev];
  }

  const winStart = new Date(windowStartIso);
  const winEnd = new Date(windowEndIso);
  const rule = rules[0];
  const interval = Math.max(1, rule.interval ?? 1);
  const maxCount = rule.count && rule.count > 0 ? rule.count : 366;
  const untilDate = rule.until ? new Date(rule.until) : null;
  const overrides = ev.recurrenceOverrides ?? {};

  const out: JSCalendarEvent[] = [];
  let emitted = 0;

  for (let step = 0; step < 1000 && emitted < maxCount; step++) {
    const occDate = addFrequencyStep(startDate, rule.frequency, interval, step);
    if (untilDate && !Number.isNaN(untilDate.getTime()) && occDate.getTime() > untilDate.getTime()) {
      break;
    }
    emitted++;

    const occIso = formatLocalDateTime(occDate);
    const occKeyDate = occIso.slice(0, 10);
    const override = overrides[occIso] ?? overrides[occKeyDate];
    if (override?.excluded) {
      continue;
    }

    const merged: JSCalendarEvent = {
      ...ev,
      ...(override ?? {}),
      id: ev.id,
      start: override?.start ?? occIso,
      recurrenceId: occIso,
      isOccurrence: step > 0 || Boolean(override)
    };

    const mergedDate = new Date(merged.start);
    if (
      (Number.isNaN(winStart.getTime()) || mergedDate.getTime() >= winStart.getTime()) &&
      (Number.isNaN(winEnd.getTime()) || mergedDate.getTime() <= winEnd.getTime())
    ) {
      out.push(merged);
    }
  }

  return out;
}

export interface ParsedIcsInvitation {
  uid: string;
  title: string;
  start: string;
  location: string;
  description: string;
}

function parseIcsDateToLocal(raw: string): string {
  const clean = raw.trim().replace(/^.*:/, '');
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return new Date().toISOString().slice(0, 19);
  const [, y, mo, d, h = '09', mi = '00', s = '00', z] = m;
  if (z === 'Z') {
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

export function parseIcsInvitation(icsText: string): ParsedIcsInvitation | null {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const veventMatch = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
  if (!veventMatch) return null;
  const block = veventMatch[1];
  const getField = (name: string) => {
    const m = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'mi'));
    return m ? m[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',') : '';
  };
  const title = getField('SUMMARY') || 'Invitation';
  const dtstart = getField('DTSTART');
  return {
    uid: getField('UID') || `ics-${Date.now()}`,
    title,
    start: dtstart ? parseIcsDateToLocal(dtstart) : new Date().toISOString().slice(0, 19),
    location: getField('LOCATION'),
    description: getField('DESCRIPTION')
  };
}

export async function respondToIcsInvitation(
  accountId: string,
  icsText: string,
  response: 'accepted' | 'tentative' | 'declined'
): Promise<ParsedIcsInvitation> {
  const inv = parseIcsInvitation(icsText);
  if (!inv) throw new Error('Invitation .ics invalide');

  const { defaultCalId, events } = await fetchEvents(accountId);
  if (!defaultCalId) throw new Error('Aucun calendrier disponible');

  const accId = await getPrimaryAccountId(accountId, CAP);
  const statusMap = { accepted: 'confirmed', tentative: 'tentative', declined: 'cancelled' } as const;
  const existing = events.find((ev: any) => ev.uid === inv.uid || (ev.title === inv.title && ev.start?.slice(0, 16) === inv.start.slice(0, 16)));

  if (existing?.id) {
    await jmapCall(accountId, [[
      'CalendarEvent/set',
      {
        accountId: accId,
        update: {
          [existing.id]: {
            status: statusMap[response],
            freeBusyStatus: response === 'declined' ? 'free' : 'busy'
          }
        }
      },
      'icsu0'
    ]], [CAP]);
  } else {
    const desc = [inv.location ? `Lieu : ${inv.location}` : '', inv.description].filter(Boolean).join('\n\n');
    await jmapCall(accountId, [[
      'CalendarEvent/set',
      {
        accountId: accId,
        create: {
          ics1: {
            '@type': 'Event',
            uid: inv.uid,
            calendarIds: { [defaultCalId]: true },
            title: inv.title,
            start: inv.start,
            duration: 'PT1H',
            description: desc,
            status: statusMap[response],
            freeBusyStatus: response === 'declined' ? 'free' : 'busy'
          }
        }
      },
      'icsc0'
    ]], [CAP]);
  }
  return inv;
}
