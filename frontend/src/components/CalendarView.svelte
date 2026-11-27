<script lang="ts">
  import { errorMessage } from '../lib/errorMessage';
  type AccountLike = { id?: string; username?: string; email?: string; name?: string };
  type ParticipantLike = string | { email?: string; address?: string; mail?: string };
  type CalendarEventExt = JSCalendarEvent & { uid?: string; summary?: string; dtstart?: string; sequence?: number };
  import { filterTasksByStatus, toggleTaskProgressValue } from '../lib/threadHelpers';
  import { CALENDAR_VIEW_STORAGE_KEY, loadCalendarView, saveCalendarView, type CalendarViewMode } from '../lib/calendarViewStorage';
  import { computeDropReschedule, DAY_HOURS, filterEventsForHalfHour, filterEventsForHour, HALF_HOUR_SLOTS, normalizeSlotTime } from '../lib/calendarGrid';
  import { jmapCall, sendEmail, uploadAttachment } from '../lib/jmap/client';
  import { buildIcsInvitation, createIcsFile } from '../lib/ics';
  import {
    createEvent,
    deleteEvent,
    fetchEvents,
    expandEventOccurrences,
    importEventsJSON,
    updateEvent,
    type CalendarItemKind,
    type JSCalendarEvent
  } from '../lib/jmap/calendar';
  import { eventsToIcs, icsToEvents } from '../lib/utils/formats';
  import ConfirmModal from './ConfirmModal.svelte';

interface ContactEntry { name: string; email: string; }
  let contactList = $state<ContactEntry[]>([]);
  let showSuggestions = $state(false);

  function currentSearchToken(raw: string): string {
    const parts = raw.split(',');
    return (parts[parts.length - 1] || '').trim().toLowerCase();
  }

  let contactSuggestions = $derived.by(() => {
    const token = currentSearchToken(participantsInput);
    if (!token || token.length < 1) return [];
    const existing = new Set(
      participantsInput.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    return contactList
      .filter((c) => !existing.has(c.email.toLowerCase()))
      .filter((c) => c.name.toLowerCase().includes(token) || c.email.toLowerCase().includes(token))
      .slice(0, 6);
  });

  function pickContactSuggestion(email: string) {
    const parts = participantsInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0 && !parts[parts.length - 1].includes('@')) {
      parts.pop();
    }
    parts.push(email);
    participantsInput = parts.join(', ') + ', ';
    showSuggestions = false;
  }

  async function resolveSenderEmail(): Promise<string> {
    if (organizerEmail && organizerEmail.includes('@')) return organizerEmail;
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const list = await res.json();
        const found = (list as AccountLike[]).find((a) => a.id === accountId) || (list as AccountLike[])[0];
        if (found?.username) return found.username;
      }
    } catch {}
    return (localStorage.getItem('enveloppe_calendar_organizer_v1')?.trim() || '');
  }

  async function loadContactsForAutocomplete() {
    try {
      const res = await fetch(`/api/jmap/${encodeURIComponent(accountId)}/contacts`);
      if (res.ok) {
        const data = await res.json();
        const rawItems = Array.isArray(data) ? data : (data.contacts || data.items || []);
        const parsed: ContactEntry[] = [];
        for (const item of rawItems) {
          const name = item.name || item.fullName || item.displayName || '';
          const emails = Array.isArray(item.emails)
            ? item.emails.map((e: unknown) => (typeof e === 'string' ? e : (e as { value?: string; email?: string })?.value || (e as { value?: string; email?: string })?.email || ''))
            : [item.email || ''];
          for (const em of emails) {
            const clean = (em || '').trim();
            if (clean.includes('@')) {
              parsed.push({ name: name || clean, email: clean });
            }
          }
        }
        contactList = parsed;
      }
    } catch {}
  }

  $effect(() => {
    if (accountId) {
      loadContactsForAutocomplete();
    }
  });



  let { accountId, organizerEmail = '' }: { accountId: string; organizerEmail?: string } = $props();

  let defaultCalId = $state('');
  let events = $state<JSCalendarEvent[]>([]);
  let view = $state<CalendarViewMode>(loadCalendarView());
  $effect(() => {
    saveCalendarView(view);
  });
  let cursor = $state(new Date());

  let showModal = $state(false);
  let dragRangeYmd = $state<string | null>(null);
  let dragRangeStartSlot = $state<string | null>(null);
  let dragRangeEndSlot = $state<string | null>(null);
  let rangeEndTime = $state('');
  let kind = $state<CalendarItemKind>('event');
  let title = $state('');
  let participantsInput = $state('');
  let start = $state('');
  let description = $state('');
  let inviteesText = $state('');
  let saving = $state(false);
  let inviteSendStatus = $state('');
  let editingEvent = $state<JSCalendarEvent | null>(null);
  let editTitle = $state('');
  let editStart = $state('');
  let editDescription = $state('');
  let editInviteesText = $state('');
  let editIcsStatus = $state<{ kind: 'idle' | 'sending' | 'ok' | 'error'; message: string }>({
    kind: 'idle',
    message: ''
  });
  let updating = $state(false);
  let draggedEvent = $state<JSCalendarEvent | null>(null);
  let dragOverYmd = $state<string | null>(null);

  let selectedEvent = $state<JSCalendarEvent | null>(null);
  let eventToDelete = $state<JSCalendarEvent | null>(null);

  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const HOURS = DAY_HOURS;
  let dragOverSlotKey = $state<string | null>(null);

  async function load() {
    const data = await fetchEvents(accountId);
    defaultCalId = data.defaultCalId;
    events = data.events;
  }
  $effect(() => { if (accountId) load(); });

  function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function startOfWeekMonday(d: Date): Date {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - offset);
    return copy;
  }

  function addMinutesToSlot(slotHHMM: string, mins: number): string {
    const [hStr, mStr = '00'] = normalizeSlotTime(slotHHMM).split(':');
    const total = Math.min(23 * 60 + 59, Math.max(0, Number(hStr) * 60 + Number(mStr) + mins));
    const nh = String(Math.floor(total / 60)).padStart(2, '0');
    const nm = String(total % 60).padStart(2, '0');
    return `${nh}:${nm}`;
  }

  function openCreateModal(ymd: string, hour = '09', endSlot?: string) {
    draggedEvent = null;
    dragOverYmd = null;
    dragOverSlotKey = null;
    selectedEvent = null;
    kind = 'event';
    title = '';
    description = '';
    inviteesText = '';
    const normStart = normalizeSlotTime(hour);
    start = `${ymd}T${normStart}:00`;
    const normEnd = endSlot ? addMinutesToSlot(endSlot, 30) : addMinutesToSlot(normStart, 60);
    rangeEndTime = `${ymd}T${normEnd}:00`;
    showModal = true;
  }

  function handleSlotRangeStart(ymd: string, slot: string) {
    dragRangeYmd = ymd;
    dragRangeStartSlot = normalizeSlotTime(slot);
    dragRangeEndSlot = normalizeSlotTime(slot);
  }

  function handleSlotRangeMove(ymd: string, slot: string) {
    if (dragRangeYmd === ymd && dragRangeStartSlot) {
      const norm = normalizeSlotTime(slot);
      dragRangeEndSlot = norm >= dragRangeStartSlot ? norm : dragRangeStartSlot;
    }
  }

  function handleSlotRangeCommit(ymd: string, slot: string) {
    if (dragRangeYmd === ymd && dragRangeStartSlot) {
      const sSlot = dragRangeStartSlot;
      const eSlot = normalizeSlotTime(slot) >= sSlot ? normalizeSlotTime(slot) : sSlot;
      dragRangeYmd = null;
      dragRangeStartSlot = null;
      dragRangeEndSlot = null;
      if (eSlot !== sSlot) {
        openCreateModal(ymd, sSlot, eSlot);
        return true;
      }
    }
    dragRangeYmd = null;
    dragRangeStartSlot = null;
    dragRangeEndSlot = null;
    return false;
  }

  function eventsForDate(ymd: string): JSCalendarEvent[] {
    const dayStart = `${ymd}T00:00:00`;
    const dayEnd = `${ymd}T23:59:59`;
    const expanded: JSCalendarEvent[] = [];
    for (const ev of events) {
      if (ev.recurrenceRules?.length) {
        expanded.push(...expandEventOccurrences(ev, dayStart, dayEnd));
      } else if ((ev.start || '').startsWith(ymd)) {
        expanded.push(ev);
      }
    }
    const filtered = expanded.filter((item) => {
      if (!item.categories?.['Tâche']) return true;
      const proxyTask = { id: item.id ?? '', progress: taskProgressOf(item), title: item.title };
      return filterTasksByStatus([proxyTask], taskFilter).length > 0;
    });
    return filtered.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }

  function formatTime(iso: string): string {
    return iso.length >= 16 ? iso.slice(11, 16) : '';
  }

  let taskFilter = $state<'all' | 'todo' | 'completed'>('all');
  let createRecurrencePreset = $state<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  let createDurationMinutes = $state<number>(60);

  function taskProgressOf(ev: JSCalendarEvent): 'completed' | 'needs-action' {
    return ev.categories?.['Terminée'] ? 'completed' : 'needs-action';
  }

  async function toggleTaskDone(ev: JSCalendarEvent) {
    if (!ev?.id) return;
    const nextProgress = toggleTaskProgressValue(taskProgressOf(ev));
    const nextCats: Record<string, boolean> = { ...(ev.categories ?? {}) };
    if (nextProgress === 'completed') {
      nextCats['Terminée'] = true;
    } else {
      delete nextCats['Terminée'];
    }
    await updateEvent(accountId, ev.id, { categories: nextCats });
    await load();
  }

  function badgeFor(ev: JSCalendarEvent): string {
    if (ev.categories?.['Anniversaire']) return '🎂 ';
    if (ev.categories?.['Tâche']) return '✅ ';
    return '';
  }

  let todayYMD = $derived(toYMD(new Date()));

  let headerLabel = $derived.by(() => {
    if (view === 'month') {
      return cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const mon = startOfWeekMonday(cursor);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return mon.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' — ' + sun.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return cursor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  });

  let monthCells = $derived.by(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startGrid = startOfWeekMonday(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(startGrid);
      d.setDate(startGrid.getDate() + i);
      return { date: d, ymd: toYMD(d), inMonth: d.getMonth() === cursor.getMonth() };
    });
  });

  let weekDays = $derived.by(() => {
    const mon = startOfWeekMonday(cursor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return { date: d, ymd: toYMD(d) };
    });
  });
  function eventsForHour(ymd: string, hourStr: string): JSCalendarEvent[] {
    return filterEventsForHour(eventsForDate(ymd), hourStr);
  }
  function eventsForHalfHour(ymd: string, slot: string): JSCalendarEvent[] {
    return filterEventsForHalfHour(eventsForDate(ymd), slot);
  }

  function handleDragStart(e: DragEvent, ev: JSCalendarEvent) {
    if (!ev.id) return;
    draggedEvent = ev;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ev.id);
    }
  }

  function handleDragEnd() {
    draggedEvent = null;
    dragOverYmd = null;
    dragOverSlotKey = null;
  }

  async function handleDropOnTarget(e: DragEvent, targetYmd: string, targetSlot?: string) {
    e.preventDefault();
    e.stopPropagation();
    const ev = draggedEvent;
    dragOverYmd = null;
    dragOverSlotKey = null;
    draggedEvent = null;
    if (!ev?.id) return;

    const plan = computeDropReschedule(ev, targetYmd, targetSlot);
    if (!plan.changed) return;

    await updateEvent(accountId, ev.id, {
      start: plan.nextStartJmap,
      sequence: plan.nextSequence
    });
    await load();
  }

  function shift(delta: number) {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + delta);
    else if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    cursor = d;
  }

  function toDatetimeLocal(iso: string): string {
    if (!iso) return '';
    return iso.length >= 16 ? iso.slice(0, 16) : iso;
  }

  function extractParticipantEmails(ev: JSCalendarEvent | Record<string, unknown>): string[] {
    if (!ev?.participants || typeof ev.participants !== 'object') return [];
    return Object.values(ev.participants)
      .map((p: ParticipantLike) => (typeof p === 'string' ? p : (p?.email || p?.address || p?.mail || '')))
      .map((s: string) => s.trim())
      .filter((s: string) => s.includes('@'));
  }

  function openEditModal(ev: JSCalendarEvent, overrideYmd?: string, overrideHour?: string) {
    selectedEvent = null;
    editingEvent = ev;
    editTitle = ev.title || '';
    const baseIso = toDatetimeLocal(ev.start || '');
    if (overrideYmd) {
      const timePart = overrideHour ? `${overrideHour}:00` : (baseIso.length >= 16 ? baseIso.slice(11, 16) : '09:00');
      editStart = `${overrideYmd}T${timePart}`;
    } else {
      editStart = baseIso;
    }
    editDescription = ev.description || '';
    editInviteesText = extractParticipantEmails(ev).join(', ');
    editIcsStatus = { kind: 'idle', message: '' };
  }

  function parseInvitees(raw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[,;\s]+/)) {
      const email = part.trim();
      if (email && email.includes('@') && !seen.has(email.toLowerCase())) {
        seen.add(email.toLowerCase());
        out.push(email);
      }
    }
    return out;
  }

  function removeEditInvitee(targetEmail: string) {
    const remaining = parseInvitees(editInviteesText).filter(
      (em) => em.toLowerCase() !== targetEmail.toLowerCase()
    );
    editInviteesText = remaining.join(', ');
  }

  async function handleUpdateSave(e: Event) {
    e.preventDefault();
    if (!editingEvent?.id) return;
    updating = true;
    editIcsStatus = { kind: 'idle', message: '' };
    try {
      const nextSeq = typeof editingEvent.sequence === 'number' ? editingEvent.sequence + 1 : 1;
      const recipients = parseInvitees(editInviteesText);
      const participantsMap = Object.fromEntries(
        recipients.map((em, i) => [`p${i + 1}`, { email: em, name: em.split('@')[0] }])
      );
      await updateEvent(accountId, editingEvent.id, {
        title: editTitle.trim() || editingEvent.title,
        start: editStart,
        description: editDescription,
        sequence: nextSeq,
        participants: participantsMap
      });
      if (recipients.length > 0) {
        editIcsStatus = {
          kind: 'sending',
          message: `Envoi de la mise à jour (.ics) à ${recipients.join(', ')}...`
        };
        try {
          await dispatchEventUpdateIcs(
            {
              ...editingEvent,
              title: editTitle.trim() || editingEvent.title,
              description: editDescription,
              sequence: nextSeq,
              participants: participantsMap
            },
            editStart
          );
          const okMsg = `Modification (.ics) envoyée à ${recipients.join(', ')}.`;
          editIcsStatus = { kind: 'ok', message: okMsg };
          inviteSendStatus = okMsg;
          setTimeout(() => (inviteSendStatus = ''), 5000);
        } catch (mailErr: unknown) {
          console.error('Modification .ics:', mailErr);
          const errMsg = errorMessage(mailErr, "Échec de l'envoi de la modification (.ics).");
          editIcsStatus = { kind: 'error', message: errMsg };
          inviteSendStatus = errMsg;
          setTimeout(() => (inviteSendStatus = ''), 6000);
          await load();
          return;
        }
      }
      editingEvent = null;
      await load();
    } finally {
      updating = false;
    }
  }

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!defaultCalId) return;
    saving = true;
    try {
      const invitees = kind === 'event'
        ? inviteesText.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
        : [];
      const created = await createEvent(accountId, defaultCalId, title, start, description, kind, invitees) as unknown;
      const createdObj = created as { id?: string; event?: { id?: string } } | null;
      const createdId = createdObj?.id || createdObj?.event?.id;
      if (createdId && kind === 'event') {
        const extraPatch: Record<string, unknown> = {};
        if (createDurationMinutes > 0 && createDurationMinutes !== 60) {
          extraPatch.duration = `PT${createDurationMinutes}M`;
        }
        if (createRecurrencePreset !== 'none') {
          extraPatch.recurrenceRules = [{ '@type': 'RecurrenceRule', frequency: createRecurrencePreset }];
        }
        if (Object.keys(extraPatch).length > 0) {
          await updateEvent(accountId, createdId, extraPatch);
        }
      }
      createRecurrencePreset = 'none';
      createDurationMinutes = 60;
      if (kind === 'event' && invitees.length > 0) {
        await dispatchEventInvitationIcs(title, start, description, invitees);
      }
      showModal = false;
      await load();
    } finally {
      saving = false;
    }
  }

  async function confirmDeleteEvent() {
    if (!eventToDelete?.id) return;
    const targetEv = eventToDelete;
    await deleteEvent(accountId, targetEv.id!);
    try {
      await dispatchEventCancellationIcs(targetEv);
    } catch (e: unknown) {
      console.error('Annulation .ics:', e);
      inviteSendStatus = errorMessage(e, "Échec de l'envoi de l'annulation (.ics).");
      setTimeout(() => (inviteSendStatus = ''), 6000);
    }
    if (selectedEvent?.id === eventToDelete.id) selectedEvent = null;
    eventToDelete = null;
    await load();
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !defaultCalId) return;
    const text = await file.text();
    const json = file.name.endsWith('.ics') ? JSON.stringify(icsToEvents(text)) : text;
    await importEventsJSON(accountId, defaultCalId, json);
    await load();
  }


  async function dispatchEventInvitationIcs(evTitle: string, evStart: string, evDescription: string, recipients: string[]) {
    if (recipients.length === 0) return;

    let sender = organizerEmail && organizerEmail.includes('@') ? organizerEmail : '';
    if (!sender) {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accs = await accRes.json();
          const cur = (accs as AccountLike[]).find((a) => a.id === accountId) || (accs as AccountLike[])[0];
          sender = cur?.username || '';
        }
      } catch {}
    }

    const icsContent = buildIcsInvitation({
      title: evTitle || 'Événement',
      start: evStart || new Date().toISOString(),
      description: evDescription || undefined,
      organizerEmail: sender || (localStorage.getItem('enveloppe_calendar_organizer_v1')?.trim() || ''),
      attendees: recipients
    });
    const icsFile = createIcsFile(icsContent, 'invitation.ics');
    const uploadedAtt = await uploadAttachment(accountId, icsFile);

    const formattedDate = evStart
      ? new Date(evStart).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
      : '';
    const textBody = [
      'Bonjour,',
      '',
      `Vous êtes invité(e) à l\'événement : ${evTitle || 'Événement'}`,
      formattedDate ? `Date : ${formattedDate}` : '',
      evDescription ? `\nNotes :\n${evDescription}` : '',
      '',
      'Le fichier invitation.ics est joint à cet e-mail.'
    ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');

    await sendEmail(
      accountId,
      recipients.join(', '),
      `Invitation : ${evTitle || 'Événement'}`,
      textBody,
      [uploadedAtt]
    );
    inviteSendStatus = `Invitation (.ics) envoyée à ${recipients.join(', ')}.`;
    setTimeout(() => (inviteSendStatus = ''), 5000);
  }

  async function dispatchEventUpdateIcs(ev: CalendarEventExt, nextStart: string) {
    if (!ev) return;
    const rawParticipants = ev.participants && typeof ev.participants === 'object'
      ? Object.values(ev.participants)
      : [];
    const recipients = rawParticipants
      .map((part: ParticipantLike) => (typeof part === 'string' ? part : (part?.email || part?.address || part?.mail || '')))
      .map((s: string) => s.trim())
      .filter((s: string) => s.includes('@'));
    if (recipients.length === 0) return;

    let sender = organizerEmail && organizerEmail.includes('@') ? organizerEmail : '';
    if (!sender) {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accs = await accRes.json();
          const cur = (accs as AccountLike[]).find((a) => a.id === accountId) || (accs as AccountLike[])[0];
          sender = cur?.username || '';
        }
      } catch {}
    }

    const evTitle = ev.title || ev.summary || 'Événement';
    const nextSeq = typeof ev?.sequence === 'number' ? ev.sequence + 1 : 1;
    const icsStr = buildIcsInvitation({
      uid: ev.uid || ev.id || undefined,
      title: evTitle,
      start: nextStart,
      description: ev.description || undefined,
      sequence: nextSeq,
      organizerEmail: sender || (localStorage.getItem('enveloppe_calendar_organizer_v1')?.trim() || ''),
      attendees: recipients,
      method: 'REQUEST'
    });
    const icsFile = createIcsFile(icsStr, 'invitation.ics');
    const uploadedAtt = await uploadAttachment(accountId, icsFile);

    const whenTxt = nextStart
      ? new Date(nextStart).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
      : '';
    const updateBody = [
      'Bonjour,',
      '',
      `L'événement suivant a été modifié : ${evTitle}`,
      whenTxt ? `Nouvelle date : ${whenTxt}` : '',
      ev.description ? `\nNotes :\n${ev.description}` : '',
      '',
      'Le fichier invitation.ics mis à jour est joint à cet e-mail.'
    ].filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n');

    await sendEmail(
      accountId,
      recipients.join(', '),
      `Modification : ${evTitle}`,
      updateBody,
      [uploadedAtt]
    );
    inviteSendStatus = `Modification (.ics) envoyée à ${recipients.join(', ')}.`;
    setTimeout(() => (inviteSendStatus = ''), 5000);
  }


  async function dispatchEventCancellationIcs(ev: CalendarEventExt) {
    if (!ev) return;
    const rawParticipants = ev.participants && typeof ev.participants === 'object'
      ? Object.values(ev.participants)
      : [];
    const recipients = rawParticipants
      .map((p: ParticipantLike) => (typeof p === 'string' ? p : (p?.email || p?.address || p?.mail || '')))
      .map((s: string) => s.trim())
      .filter((s: string) => s.includes('@'));
    if (recipients.length === 0) return;

    let sender = organizerEmail && organizerEmail.includes('@') ? organizerEmail : '';
    if (!sender) {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accs = await accRes.json();
          const cur = (accs as AccountLike[]).find((a) => a.id === accountId) || (accs as AccountLike[])[0];
          sender = cur?.username || '';
        }
      } catch {}
    }

    const evTitle = ev.title || ev.summary || 'Événement';
    const evStart = ev.start || ev.dtstart || new Date().toISOString();
    const icsStr = buildIcsInvitation({
      uid: ev.uid || ev.id || undefined,
      title: evTitle,
      start: evStart,
      description: ev.description ? `Annulé : ${ev.description}` : 'Événement annulé.',
      sequence: typeof ev?.sequence === 'number' ? ev.sequence + 1 : 1,
      organizerEmail: sender || (localStorage.getItem('enveloppe_calendar_organizer_v1')?.trim() || ''),
      attendees: recipients,
      method: 'CANCEL'
    });
    const icsFile = createIcsFile(icsStr, 'invitation.ics');
    const uploadedAtt = await uploadAttachment(accountId, icsFile);

    const whenTxt = evStart ? new Date(evStart).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : '';
    const cancelBody = [
      'Bonjour,',
      '',
      `L\'événement suivant a été annulé : ${evTitle}`,
      whenTxt ? `Date prévue : ${whenTxt}` : '',
      '',
      'Le fichier invitation.ics (annulation) est joint à cet e-mail.'
    ].filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n');

    await sendEmail(
      accountId,
      recipients.join(', '),
      `Annulation : ${evTitle}`,
      cancelBody,
      [uploadedAtt]
    );
    inviteSendStatus = `Annulation (.ics) envoyée à ${recipients.join(', ')}.`;
    setTimeout(() => (inviteSendStatus = ''), 5000);
  }
  import CalendarEventModals from './CalendarEventModals.svelte';
</script>

<div class="flex h-full flex-col overflow-hidden">
  <header class="env-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
    <div class="flex items-center gap-3">
      <div class="env-input flex items-center overflow-hidden rounded-xl border">
        <button type="button" onclick={() => shift(-1)} aria-label="Période précédente" class="env-hover px-3 py-1.5 text-sm font-medium">‹</button>
        <button type="button" onclick={() => (cursor = new Date())} class="env-border env-hover border-x px-3.5 py-1.5 text-xs font-semibold">Aujourd'hui</button>
        <button type="button" onclick={() => shift(1)} aria-label="Période suivante" class="env-hover px-3 py-1.5 text-sm font-medium">›</button>
      </div>
      <h2 class="env-text text-lg font-bold capitalize">{headerLabel}</h2>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="env-subtle env-border flex rounded-xl border p-0.5 text-xs">
        <button type="button" onclick={() => (view = 'month')} class="rounded-lg px-3 py-1.5 {view === 'month' ? 'env-accent-soft font-semibold' : 'env-muted'}">Mois</button>
        <button type="button" onclick={() => (view = 'week')} class="rounded-lg px-3 py-1.5 {view === 'week' ? 'env-accent-soft font-semibold' : 'env-muted'}">Semaine</button>
        <button type="button" onclick={() => (view = 'day')} class="rounded-lg px-3 py-1.5 {view === 'day' ? 'env-accent-soft font-semibold' : 'env-muted'}">Jour</button>
      </div>

      <button type="button" onclick={() => openCreateModal(toYMD(cursor))} class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold hover:opacity-95">+ Nouveau</button>
      <div class="inline-flex items-center gap-1 rounded-lg border p-0.5 text-xs" role="group" aria-label="Filtre des tâches">
        <button type="button" onclick={() => (taskFilter = 'all')} class="rounded px-2 py-1 {taskFilter === 'all' ? 'env-accent-soft font-semibold' : 'env-muted'}">Toutes</button>
        <button type="button" onclick={() => (taskFilter = 'todo')} class="rounded px-2 py-1 {taskFilter === 'todo' ? 'env-accent-soft font-semibold' : 'env-muted'}">À faire</button>
        <button type="button" onclick={() => (taskFilter = 'completed')} class="rounded px-2 py-1 {taskFilter === 'completed' ? 'env-accent-soft font-semibold' : 'env-muted'}">Terminées</button>
      </div>
      <button type="button" onclick={() => downloadFile(eventsToIcs(events), 'calendrier.ics', 'text/calendar')} class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium">.ics</button>
      <label class="env-input env-hover cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium">
        Importer
        <input type="file" accept=".ics,.json" onchange={handleImport} class="hidden" aria-label="Importer un calendrier (.ics ou .json)" />
      </label>
    </div>
  </header>

  {#if view === 'month'}
    <div class="env-subtle env-border env-muted grid grid-cols-7 border-b text-center text-xs font-semibold uppercase tracking-wider">
      {#each DAYS as d}<div class="py-2.5">{d}</div>{/each}
    </div>
    <div class="env-divider grid flex-1 grid-cols-7 grid-rows-6 gap-1.5 overflow-hidden p-2">
      {#each monthCells as cell}
        <div
          role="button"
          tabindex="0"
          ondragover={(e) => { e.preventDefault(); dragOverYmd = cell.ymd; }}
          ondragleave={() => { if (dragOverYmd === cell.ymd) dragOverYmd = null; }}
          ondrop={(e) => handleDropOnTarget(e, cell.ymd)}
          onclick={(e) => {
            if (e.target instanceof Element && e.target.closest('button')) return;
            openCreateModal(cell.ymd);
          }}
          onkeydown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              openCreateModal(cell.ymd);
            }
          }}
          class="env-card env-hover flex cursor-pointer flex-col overflow-hidden rounded-lg border p-2 text-left transition-colors {cell.inMonth ? '' : 'opacity-45'} {dragOverYmd === cell.ymd ? 'ring-2 ring-[var(--env-accent)]' : ''}"
        >
          <button
            type="button"
            title="Voir cette journée"
            onclick={(e) => { e.stopPropagation(); cursor = cell.date; view = 'day'; }}
            class="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs {cell.ymd === todayYMD ? 'env-accent-bg font-bold' : 'env-muted hover:ring-1 hover:ring-[var(--env-accent)]'}"
          >
            {cell.date.getDate()}
          </button>
          <div class="space-y-1 overflow-y-auto">
            {#each eventsForDate(cell.ymd).slice(0, 3) as ev}
              <div
                role="button"
                tabindex="0"
                draggable={Boolean(ev.id)}
                ondragstart={(e) => handleDragStart(e, ev)}
                ondragend={handleDragEnd}
                onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectedEvent = ev; } }}
                class="env-accent-soft group/ev flex items-center justify-between gap-1 rounded-lg px-2 py-0.5 text-xs font-medium {ev.id ? 'cursor-grab active:cursor-grabbing' : ''}"
              >
                <span class="truncate">
                  {badgeFor(ev)}{#if !ev.showWithoutTime}<span class="font-mono text-[11px] opacity-80">{formatTime(ev.start)} </span>{/if}{ev.title}
                </span>

                {#if ev.id}
                  <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/ev:opacity-100">
                    {#if ev.categories?.['Tâche']}
                      <button
                        type="button"
                        title={taskProgressOf(ev) === 'completed' ? 'Marquer comme à faire' : 'Marquer comme terminée'}
                        aria-label="{taskProgressOf(ev) === 'completed' ? 'Marquer comme à faire' : 'Marquer comme terminée'} {ev.title}"
                        onclick={(e) => { e.stopPropagation(); void toggleTaskDone(ev); }}
                        class="rounded px-1 text-[11px] font-semibold hover:opacity-100"
                      >
                        {taskProgressOf(ev) === 'completed' ? '↩️' : '✓'}
                      </button>
                    {/if}
                    <button
                      type="button"
                      title="Modifier"
                      aria-label="Modifier {ev.title}"
                      onclick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                      class="text-xs hover:opacity-100"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      title="Supprimer"
                      aria-label="Supprimer {ev.title}"
                      onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                      class="text-xs hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  {:else if view === 'week'}
    <div class="flex-1 overflow-auto p-3">
      <div class="env-card env-border min-w-[760px] overflow-hidden rounded-xl border">
        <div class="env-subtle env-border grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b text-center text-xs">
          <div class="env-faint flex items-center justify-center border-r py-2 font-mono text-[11px]">Heure</div>
          {#each weekDays as day, idx}
            <button
              type="button"
              onclick={() => { cursor = day.date; view = 'day'; }}
              class="env-border env-hover border-r py-2.5 last:border-r-0"
            >
              <div class="env-muted text-[11px] uppercase">{DAYS[idx]}</div>
              <div class="mx-auto mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold {day.ymd === todayYMD ? 'env-accent-bg font-bold' : 'env-text'}">
                {day.date.getDate()}
              </div>
            </button>
          {/each}
        </div>

        <div class="divide-y env-divider">
          {#each HOURS as h}
            {@const hourStr = String(h).padStart(2, '0')}
            {@const slotLabel = `${hourStr}:00`}
            <div class="grid grid-cols-[68px_repeat(7,minmax(0,1fr))]">
              <div class="env-faint border-r px-2 py-2 text-right font-mono text-[11px]">{slotLabel}</div>
              {#each weekDays as day}
                {@const cellKey = `${day.ymd}T${slotLabel}`}
                {@const slotEvents = eventsForHour(day.ymd, hourStr)}
                <div
                  role="button"
                  tabindex="0"
                  ondragover={(e) => { e.preventDefault(); dragOverSlotKey = cellKey; }}
                  ondragleave={() => { if (dragOverSlotKey === cellKey) dragOverSlotKey = null; }}
                  ondrop={(e) => handleDropOnTarget(e, day.ymd, slotLabel)}
                  onclick={() => openCreateModal(day.ymd, hourStr)}
                  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openCreateModal(day.ymd, hourStr)}
                  class="env-border env-hover min-h-14 cursor-pointer border-r p-1.5 transition-colors last:border-r-0 {dragOverSlotKey === cellKey ? 'env-accent-soft ring-2 ring-inset ring-[var(--env-accent)]' : ''}"
                >
                  <div class="space-y-1">
                    {#each slotEvents as ev}
                      <div
                        role="button"
                        tabindex="0"
                        draggable={Boolean(ev.id)}
                        ondragstart={(e) => handleDragStart(e, ev)}
                        ondragend={handleDragEnd}
                        onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectedEvent = ev; } }}
                        class="env-accent-soft group/ev rounded-lg border border-[#48B17F]/35 px-2 py-1 text-xs {ev.id ? 'cursor-grab active:cursor-grabbing' : ''}"
                      >
                        <div class="flex items-center justify-between gap-1">
                          <span class="font-mono text-[11px] opacity-85">{formatTime(ev.start)}</span>
                          {#if ev.id}
                            <div class="flex shrink-0 items-center gap-0.5 opacity-75 group-hover/ev:opacity-100">
                              <button
                                type="button"
                                title="Modifier"
                                aria-label="Modifier {ev.title}"
                                onclick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                class="rounded px-1 text-[11px] hover:opacity-100"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                title="Supprimer"
                                aria-label="Supprimer {ev.title}"
                                onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                                class="rounded px-1 text-[11px] hover:text-red-400"
                              >
                                🗑️
                              </button>
                            </div>
                          {/if}
                        </div>
                        <div class="env-text truncate font-semibold">{badgeFor(ev)}{ev.title}</div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>

  {:else}
    {@const dayYmd = toYMD(cursor)}
    <div class="flex-1 overflow-y-auto p-5">
      <div class="env-card env-divider mx-auto max-w-3xl divide-y rounded-xl border p-2">
        {#each HALF_HOUR_SLOTS as slot}
          {@const cellKey = `${dayYmd}T${slot}`}
          {@const slotEvents = eventsForHalfHour(dayYmd, slot)}
          <div
            role="button"
            tabindex="0"
            ondragover={(e) => { e.preventDefault(); dragOverSlotKey = cellKey; }}
            ondragleave={() => { if (dragOverSlotKey === cellKey) dragOverSlotKey = null; }}
            ondrop={(e) => handleDropOnTarget(e, dayYmd, slot)}
            onmousedown={() => handleSlotRangeStart(dayYmd, slot)}
            onmouseenter={() => handleSlotRangeMove(dayYmd, slot)}
            onclick={() => { if (!handleSlotRangeCommit(dayYmd, slot)) openCreateModal(dayYmd, slot); }}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openCreateModal(dayYmd, slot)}
            class="env-hover flex min-h-10 cursor-pointer items-start gap-4 rounded-lg px-4 py-1.5 transition-colors {slot.endsWith(':30') ? 'opacity-95' : ''} {dragOverSlotKey === cellKey ? 'env-accent-soft ring-2 ring-[var(--env-accent)]' : ''}"
          >
            <span class="env-faint w-14 shrink-0 font-mono text-xs">{slot}</span>
            <div class="flex-1 space-y-1">
              {#each slotEvents as ev}
                <div
                  role="button"
                  tabindex="0"
                  draggable={Boolean(ev.id)}
                  ondragstart={(e) => handleDragStart(e, ev)}
                  ondragend={handleDragEnd}
                  onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectedEvent = ev; } }}
                  class="env-accent-soft rounded-xl border border-[#48B17F]/40 px-3.5 py-1.5 {ev.id ? 'cursor-grab active:cursor-grabbing' : ''}"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="env-text text-sm font-semibold">{badgeFor(ev)}{ev.title}</span>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs opacity-80">{formatTime(ev.start)}</span>
                      {#if ev.id}
                        {#if ev.categories?.['Tâche']}
                          <button
                            type="button"
                            onclick={(e) => { e.stopPropagation(); void toggleTaskDone(ev); }}
                            class="rounded border px-2 py-0.5 text-[11px] font-medium env-btn-secondary"
                          >
                            {taskProgressOf(ev) === 'completed' ? 'À faire' : 'Terminée'}
                          </button>
                        {/if}
                        <button
                          type="button"
                          title="Modifier"
                          aria-label="Modifier {ev.title}"
                          onclick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                          class="rounded px-1.5 py-0.5 text-xs opacity-75 hover:opacity-100"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          title="Supprimer"
                          aria-label="Supprimer {ev.title}"
                          onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                          class="rounded px-1.5 py-0.5 text-xs opacity-75 hover:bg-red-500/15 hover:text-red-400"
                        >
                          🗑️
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if ev.description}<p class="env-muted mt-0.5 text-xs">{ev.description}</p>{/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <CalendarEventModals
    bind:selectedEvent
    bind:showModal
    bind:kind
    bind:title
    bind:start
    bind:rangeEndTime
    bind:description
    bind:participantsInput
    bind:inviteesText
    bind:createRecurrencePreset
    bind:createDurationMinutes
    {saving}
    {inviteSendStatus}
    bind:editingEvent
    bind:editTitle
    bind:editStart
    bind:editDescription
    bind:editInviteesText
    bind:editIcsStatus
    {updating}
    bind:eventToDelete
    onBadgeFor={badgeFor}
    onTaskProgressOf={taskProgressOf}
    onToggleTaskDone={toggleTaskDone}
    onOpenEditModal={openEditModal}
    onHandleSave={handleSave}
    onHandleUpdateSave={handleUpdateSave}
    onRemoveEditInvitee={removeEditInvitee}
    onConfirmDeleteEvent={confirmDeleteEvent}
    onExtractParticipantEmails={extractParticipantEmails}
    onParseInvitees={parseInvitees}
  />
</div>

