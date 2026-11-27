import type { JSCalendarEvent } from './jmap/calendar';

export const DAY_HOURS = Array.from({ length: 24 }, (_, i) => i);

export const HALF_HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export function normalizeSlotTime(slotOrHour: string): string {
  return slotOrHour.includes(':') ? slotOrHour : `${slotOrHour.padStart(2, '0')}:00`;
}

export function formatSlotTime(iso: string): string {
  return iso.length >= 16 ? iso.slice(11, 16) : '';
}

export function filterEventsForHour(
  events: JSCalendarEvent[],
  hourStr: string
): JSCalendarEvent[] {
  const prefix = `${hourStr.padStart(2, '0')}:`;
  return events.filter((ev) => !ev.showWithoutTime && formatSlotTime(ev.start).startsWith(prefix));
}

export function filterEventsForHalfHour(
  events: JSCalendarEvent[],
  slot: string
): JSCalendarEvent[] {
  const normalized = normalizeSlotTime(slot);
  return events.filter((ev) => !ev.showWithoutTime && formatSlotTime(ev.start) === normalized);
}

export interface DropRescheduleResult {
  changed: boolean;
  nextStartLocal: string;
  nextStartJmap: string;
  nextSequence: number;
}

export function computeDropReschedule(
  ev: Pick<JSCalendarEvent, 'start' | 'sequence'>,
  targetYmd: string,
  targetSlot?: string
): DropRescheduleResult {
  const existingIso = ev.start && ev.start.length >= 16 ? ev.start.slice(0, 16) : '';
  const existingTime = existingIso.length >= 16 ? existingIso.slice(11, 16) : '09:00';
  const nextTime = targetSlot ? normalizeSlotTime(targetSlot) : existingTime;
  const nextStartLocal = `${targetYmd}T${nextTime}`;
  const nextSequence = typeof ev.sequence === 'number' ? ev.sequence + 1 : 1;

  return {
    changed: existingIso !== nextStartLocal,
    nextStartLocal,
    nextStartJmap: `${nextStartLocal}:00`,
    nextSequence
  };
}
