import { getPrimaryAccountId, jmapCall } from './client';

const CAP = 'urn:ietf:params:jmap:calendars';

export type CalendarItemKind = 'event' | 'task' | 'birthday';

export interface JSCalendarEvent {
  id?: string;
  title: string;
  start: string;
  duration?: string;
  description?: string;
  showWithoutTime?: boolean;
  categories?: Record<string, boolean>;
  participants?: Record<string, { email?: string; name?: string }>;
  calendarIds?: Record<string, boolean>;
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
  const start = startLocal.length === 16 ? `${startLocal}:00` : startLocal;  const payload: Record<string, any> = { '@type': 'Event', calendarIds: { [calendarId]: true }, title, start, description };  if (kind === 'event') { payload.duration = 'PT1H'; if (invitees.length > 0) { const participants: Record<string, any> = {}; invitees.forEach((raw, idx) => { const email = raw.trim(); if (!email) return; participants[`p${idx + 1}`] = {
          '@type': 'Participant',
          email,
          sendTo: { imip: `mailto:${email}` }, kind: 'individual', roles: { attendee: true }, participationStatus: 'needs-action' }; }); if (Object.keys(participants).length > 0) { payload.participants = participants; } } } else if (kind === 'task') { payload.duration = 'PT30M'; payload.categories = { Tâche: true }; } else if (kind === 'birthday') { payload.showWithoutTime = true; payload.duration = 'P1D'; payload.categories = { Anniversaire: true }; payload.recurrenceRules = [{ '@type': 'RecurrenceRule', frequency: 'yearly' }]; }  await jmapCall(accountId, [[ 'CalendarEvent/set', { accountId: accId, create: { ev1: payload } }, 'ev0' ]], [CAP]); }  export async function deleteEvent(accountId: string, eventId: string) { const accId = await getPrimaryAccountId(accountId, CAP); const res = await jmapCall(accountId, [['CalendarEvent/set', { accountId: accId, destroy: [eventId] }, 'evd0']], [CAP]); const result = res.methodResponses?.[0]?.[1]; if (result?.notDestroyed?.[eventId]) { throw new Error(result.notDestroyed[eventId].description \vert{}\vert{} "Suppression de l'événement refusée"); } }  export async function importEventsJSON(accountId: string, calendarId: string, jsonText: string) { const accId = await getPrimaryAccountId(accountId, CAP); const items = JSON.parse(jsonText) as any[]; const create: Record<string, any> = {}; items.forEach((item, idx) => { const { id, uid, ...clean } = item; create[`ev_${idx}`] = { '@type': 'Event', calendarIds: { [calendarId]: true }, ...clean };
  });
  await jmapCall(accountId, [['CalendarEvent/set', { accountId: accId, create }, 'imp0']], [CAP]);
}
