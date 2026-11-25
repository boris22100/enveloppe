export type CalendarViewMode = 'month' | 'week' | 'day';

export const CALENDAR_VIEW_STORAGE_KEY = 'enveloppe_calendar_view_v1';

const VALID_VIEWS: readonly CalendarViewMode[] = ['month', 'week', 'day'];

export function loadCalendarView(storage?: Pick<Storage, 'getItem'> | null): CalendarViewMode {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!target) return 'month';
  try {
    const raw = target.getItem(CALENDAR_VIEW_STORAGE_KEY);
    if (raw && (VALID_VIEWS as readonly string[]).includes(raw)) {
      return raw as CalendarViewMode;
    }
  } catch {}
  return 'month';
}

export function saveCalendarView(
  view: CalendarViewMode,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!target) return;
  try {
    target.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
  } catch {}
}
