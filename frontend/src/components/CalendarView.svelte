<script lang="ts">
  interface CalContactItem { name: string; email: string; }
  let calContacts = $state<CalContactItem[]>([]);
  let showParticipantDropdown = $state(false);
  let inviteFeedback = $state('');

  function getActiveParticipantQuery(val: string): string {
    const parts = (val || '').split(',');
    return (parts[parts.length - 1] || '').trim().toLowerCase();
  }

  let filteredParticipantSuggestions = $derived.by(() => {
    const q = getActiveParticipantQuery(typeof participantsInput === 'string' ? participantsInput : '');
    if (!q) return [];
    const selected = new Set(
      (typeof participantsInput === 'string' ? participantsInput : '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    return calContacts
      .filter((c) => !selected.has(c.email.toLowerCase()))
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 6);
  });

  function selectParticipantSuggestion(email: string) {
    const current = typeof participantsInput === 'string' ? participantsInput : '';
    const parts = current.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0 && !parts[parts.length - 1].includes('@')) {
      parts.pop();
    }
    parts.push(email);
    participantsInput = parts.join(', ') + ', ';
    showParticipantDropdown = false;
  }

  async function loadCalContacts() {
    try {
      let raw: any = null;
      
      if (!raw) {
        const res = await fetch(`/api/jmap/${encodeURIComponent(accountId)}/contacts`);
        if (res.ok) raw = await res.json();
      }
      const list = Array.isArray(raw) ? raw : (raw?.contacts || raw?.items || raw?.cards || []);
      const out: CalContactItem[] = [];
      for (const c of list) {
        const name = typeof c?.name === 'string' ? c.name : (c?.name?.full || c?.fullName || c?.displayName || '');
        const ems = c?.emails && typeof c.emails === 'object'
          ? Object.values(c.emails).map((x: any) => (typeof x === 'string' ? x : x?.address || x?.value || x?.email || ''))
          : [c?.email || ''];
        for (const em of ems) {
          const clean = (em || '').trim();
          if (clean.includes('@')) out.push({ name: name || clean, email: clean });
        }
      }
      calContacts = out;
    } catch {}
  }

  $effect(() => {
    if (accountId) loadCalContacts();
  });

  async function sendCalendarInviteRobust(evTitle: string, evStart: string, evEnd: string, evLocation: string, evNotes: string) {
    const raw = typeof participantsInput === 'string' ? participantsInput : '';
    const recipients = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    if (recipients.length === 0) return;

    let sender = typeof organizerEmail === 'string' && organizerEmail.includes('@') ? organizerEmail : '';
    if (!sender) {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accs = await accRes.json();
          const cur = accs.find((a: any) => a.id === accountId) || accs[0];
          sender = cur?.username || cur?.email || '';
        }
      } catch {}
    }
    if (!sender) sender = 'noreply@localhost';

    const icsStr = buildIcsInvitation({
      title: evTitle || 'Événement',
      start: evStart || new Date().toISOString(),
      end: evEnd || undefined,
      location: evLocation || undefined,
      description: evNotes || undefined,
      organizerEmail: sender,
      attendees: recipients
    });
    const icsFile = createIcsFile(icsStr, 'invitation.ics');

    let uploaded: any = null;
    if (typeof uploadAttachment === 'function') { try { uploaded = await uploadAttachment(accountId, icsFile); } catch {} }
    if (!uploaded) {
      const fd = new FormData();
      fd.append('file', icsFile);
      for (const upUrl of [
        `/api/jmap/${encodeURIComponent(accountId)}/upload`,
        `/api/jmap/${encodeURIComponent(accountId)}/blob/upload`
      ]) {
        try {
          const r = await fetch(upUrl, { method: 'POST', body: fd });
          if (r.ok) { uploaded = await r.json(); break; }
        } catch {}
      }
    }

    const whenTxt = evStart ? new Date(evStart).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : '';
    const mailBody = [
      'Bonjour,',
      '',
      `Vous êtes invité(e) à l\'événement : ${evTitle || 'Événement'}`,
      whenTxt ? `Date : ${whenTxt}` : '',
      evLocation ? `Lieu : ${evLocation}` : '',
      evNotes ? `\nNotes :\n${evNotes}` : '',
      '',
      'Le fichier invitation.ics est joint à ce message.'
    ].filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n');

    const attachments = uploaded ? [uploaded] : [];
    let sentOk = false;
    if (typeof sendEmail === 'function') { try { await sendEmail(accountId, recipients.join(', '), `Invitation : ${evTitle || 'Événement'}`, mailBody, attachments); sentOk = true; } catch {} }
    if (!sentOk) {
      for (const sendUrl of [
        `/api/jmap/${encodeURIComponent(accountId)}/send`,
        `/api/jmap/${encodeURIComponent(accountId)}/email/send`,
        `/api/jmap/${encodeURIComponent(accountId)}/emails/send`
      ]) {
        try {
          const r = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: recipients.join(', '),
              subject: `Invitation : ${evTitle || 'Événement'}`,
              text: mailBody,
              attachments
            })
          });
          if (r.ok) { sentOk = true; break; }
        } catch {}
      }
    }

    inviteFeedback = sentOk
      ? `Invitation (.ics) envoyée à ${recipients.join(', ')}.`
      : `Échec de l\'envoi de l\'invitation à ${recipients.join(', ')} (vérifiez la route d\'envoi JMAP).`;
    if (sentOk) participantsInput = '';
    setTimeout(() => (inviteFeedback = ''), 6000);
  }

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
        const found = list.find((a: any) => a.id === accountId) || list[0];
        if (found?.username) return found.username;
      }
    } catch {}
    return 'noreply@localhost';
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
            ? item.emails.map((e: any) => (typeof e === 'string' ? e : e?.value || e?.email || ''))
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

  import { jmapCall, sendEmail, uploadAttachment } from '../lib/jmap/client';
  import { buildIcsInvitation, createIcsFile } from '../lib/ics';

  import {
    createEvent,
    deleteEvent,
    fetchEvents,
    importEventsJSON,
    type CalendarItemKind,
    type JSCalendarEvent
  } from '../lib/jmap/calendar';
  import { eventsToIcs, icsToEvents } from '../lib/utils/formats';
  import ConfirmModal from './ConfirmModal.svelte';

  let { accountId, organizerEmail = '' }: { accountId: string } = $props();

  let defaultCalId = $state('');
  let events = $state<JSCalendarEvent[]>([]);
  let view = $state<'month' | 'week' | 'day'>('month');
  let cursor = $state(new Date());

  let showModal = $state(false);
  let kind = $state<CalendarItemKind>('event');
  let title = $state('');
  let participantsInput = $state('');
  let inviteNotice = $state('');
  let start = $state('');
  let description = $state('');
  let inviteesText = $state('');
  let saving = $state(false);

  let selectedEvent = $state<JSCalendarEvent | null>(null);
  let eventToDelete = $state<JSCalendarEvent | null>(null);

  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

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

  function openCreateModal(ymd: string, hour = '09') {
    kind = 'event';
    title = '';
    description = '';
    inviteesText = '';
    start = ymd + 'T' + hour + ':00';
    showModal = true;
  }

  function eventsForDate(ymd: string): JSCalendarEvent[] {
    return events
      .filter((e) => (e.start || '').startsWith(ymd))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }

  function formatTime(iso: string): string {
    return iso.length >= 16 ? iso.slice(11, 16) : '';
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

  function shift(delta: number) {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + delta);
    else if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    cursor = d;
  }

  async function handleSave(e: Event) {
    try {
      await sendCalendarInviteRobust(
        typeof title !== 'undefined' ? title : '',
        typeof start !== 'undefined' ? start : (typeof startAt !== 'undefined' ? startAt : ''),
        typeof end !== 'undefined' ? end : (typeof endAt !== 'undefined' ? endAt : ''),
        typeof location !== 'undefined' ? location : '',
        typeof description !== 'undefined' ? description : (typeof notes !== 'undefined' ? notes : '')
      );
    } catch (e) {
      console.error('sendCalendarInviteRobust:', e);
    }

    try {
      await sendCalendarInvite(
        typeof title !== 'undefined' ? title : '',
        typeof start !== 'undefined' ? start : (typeof startAt !== 'undefined' ? startAt : ''),
        typeof end !== 'undefined' ? end : (typeof endAt !== 'undefined' ? endAt : ''),
        typeof location !== 'undefined' ? location : '',
        typeof description !== 'undefined' ? description : (typeof notes !== 'undefined' ? notes : '')
      );
    } catch (err) {
      console.error('Envoi invitation .ics:', err);
    }

    e.preventDefault();
    if (!defaultCalId) return;
    saving = true;
    try {
      const invitees = kind === 'event'
        ? inviteesText.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
        : [];
      await createEvent(accountId, defaultCalId, title, start, description, kind, invitees);
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
    try { await dispatchEventCancellationIcs(targetEv); } catch (e) { console.error('Annulation .ics:', e); }
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

  async function sendCalendarInvite(evTitle: string, evStart: string, evEnd: string, evLocation: string, evDescription: string) {
    const attendees = participantsInput
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    if (attendees.length === 0) return;

    const icsText = buildIcsInvitation({
      title: evTitle,
      start: evStart,
      end: evEnd || undefined,
      location: evLocation || undefined,
      description: evDescription || undefined,
      organizerEmail: organizerEmail || 'noreply@localhost',
      attendees
    });
    const icsFile = createIcsFile(icsText, 'invitation.ics');
    const attachment = await uploadAttachment(accountId, icsFile);

    const startLabel = evStart ? new Date(evStart).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : '';
    const bodyLines = [
      `Bonjour,`,
      ``,
      `Vous êtes invité(e) à l'événement suivant : ${evTitle}`,
      startLabel ? `Date et heure : ${startLabel}` : '',
      evLocation ? `Lieu : ${evLocation}` : '',
      evDescription ? `\nDétails :\n${evDescription}` : '',
      ``,
      `Le fichier invitation.ics est joint à ce message pour l'ajouter directement à votre calendrier.`
    ].filter((l, i, arr) => !(l === '' && arr[i - 1] === ''));

    await sendEmail(
      accountId,
      attendees.join(', '),
      `Invitation : ${evTitle}`,
      bodyLines.join('\n'),
      [attachment]
    );
    inviteNotice = `Invitation (.ics) envoyée à ${attendees.join(', ')}.`;
    participantsInput = '';
    setTimeout(() => (inviteNotice = ''), 5000);
  }


  interface CalContact { name: string; email: string; }
  let calContactPool = $state<CalContact[]>([]);
  let showInviteeDropdown = $state(false);
  let inviteSendStatus = $state('');

  let activeInviteeQuery = $derived.by(() => {
    const parts = (inviteesText || '').split(',');
    return (parts[parts.length - 1] || '').trim().toLowerCase();
  });

  let inviteeSuggestions = $derived.by(() => {
    const q = activeInviteeQuery;
    if (!q) return [];
    const already = new Set(
      (inviteesText || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    const tokens = q.split(/\s+/).filter(Boolean);
    return calContactPool
      .filter((c) => !already.has(c.email.toLowerCase()))
      .filter((c) => {
        const hay = `${c.name} ${c.email}`.toLowerCase();
        return tokens.every((tk) => hay.includes(tk));
      })
      .slice(0, 12);
  });

  function applyInviteeSuggestion(email: string) {
    const parts = (inviteesText || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0 && !parts[parts.length - 1].includes('@')) {
      parts.pop();
    }
    parts.push(email);
    inviteesText = parts.join(', ') + ', ';
    showInviteeDropdown = false;
  }

  async function refreshCalendarContacts() {
    if (!accountId) return;
    try {
      const accRes = await fetch('/api/accounts');
      if (accRes.ok) {
        const accs = await accRes.json();
        const cur = accs.find((a: any) => a.id === accountId);
        if (cur?.username && cur.username.includes('@')) {
          calContactPool = [{ name: cur.label || cur.username, email: cur.username }];
        }
      }
      // Tente JMAP Contacts (ContactCard ou Card) si supporté par le serveur
      for (const pkg of ['urn:ietf:params:jmap:contacts', 'urn:ietf:params:jmap:addressbook']) {
        try {
          const res = await jmapCall(accountId, [
            ['ContactCard/query', { filter: {} }, 'q1'],
            ['ContactCard/get', { '#ids': { resultOf: 'q1', name: 'ContactCard/query', path: '/ids' } }, 'g1']
          ], [pkg]);
          const list = res?.methodResponses?.[1]?.[1]?.list;
          if (Array.isArray(list) && list.length > 0) {
            const items: CalContact[] = [];
            for (const c of list) {
              const name = c?.name?.full || c?.fullName || '';
              const emailsObj = c?.emails || {};
              for (const v of Object.values(emailsObj) as any[]) {
                const addr = typeof v === 'string' ? v : (v?.address || v?.value || '');
                if (addr && addr.includes('@')) {
                  items.push({ name: name || addr, email: addr.trim() });
                }
              }
            }
            if (items.length > 0) {
              calContactPool = items;
              return;
            }
          }
        } catch {}
      }
    } catch {}
  }

  $effect(() => {
    if (accountId) {
      refreshCalendarContacts();
    }
  });

  async function dispatchEventInvitationIcs(evTitle: string, evStart: string, evDescription: string, recipients: string[]) {
    if (recipients.length === 0) return;

    let sender = organizerEmail && organizerEmail.includes('@') ? organizerEmail : '';
    if (!sender) {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accs = await accRes.json();
          const cur = accs.find((a: any) => a.id === accountId) || accs[0];
          sender = cur?.username || '';
        }
      } catch {}
    }

    const icsContent = buildIcsInvitation({
      title: evTitle || 'Événement',
      start: evStart || new Date().toISOString(),
      description: evDescription || undefined,
      organizerEmail: sender || 'noreply@localhost',
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


  async function dispatchEventCancellationIcs(ev: any) {
    if (!ev) return;
    const rawParticipants = ev.participants && typeof ev.participants === 'object'
      ? Object.values(ev.participants)
      : [];
    const recipients = rawParticipants
      .map((p: any) => (typeof p === 'string' ? p : (p?.email || p?.address || p?.mail || '')))
      .map((s: string) => s.trim())
      .filter((s: string) => s.includes('@'));
    if (recipients.length === 0) return;

    let sender = organizerEmail && organizerEmail.includes('@') ? organizerEmail : '';
    if (!sender) {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accs = await accRes.json();
          const cur = accs.find((a: any) => a.id === accountId) || accs[0];
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
      organizerEmail: sender || 'noreply@localhost',
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
      <button type="button" onclick={() => downloadFile(eventsToIcs(events), 'calendrier.ics', 'text/calendar')} class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium">.ics</button>
      <label class="env-input env-hover cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium">
        Importer
        <input type="file" accept=".ics,.json" onchange={handleImport} class="hidden" />
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
          onclick={() => openCreateModal(cell.ymd)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openCreateModal(cell.ymd)}
          class="env-card env-hover flex cursor-pointer flex-col overflow-hidden rounded-lg border p-2 text-left transition-colors {cell.inMonth ? '' : 'opacity-45'}"
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
                onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectedEvent = ev; } }}
                class="env-accent-soft group/ev flex items-center justify-between gap-1 rounded-lg px-2 py-0.5 text-xs font-medium"
              >
                <span class="truncate">
                  {badgeFor(ev)}{#if !ev.showWithoutTime}<span class="font-mono text-[11px] opacity-80">{formatTime(ev.start)} </span>{/if}{ev.title}
                </span>
                {#if ev.id}
                  <button
                    type="button"
                    title="Supprimer"
                    aria-label="Supprimer {ev.title}"
                    onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                    class="shrink-0 text-xs opacity-0 hover:text-red-400 group-hover/ev:opacity-100"
                  >
                    ✕
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  {:else if view === 'week'}
    <div class="env-divider grid flex-1 grid-cols-7 gap-2 overflow-y-auto p-3">
      {#each weekDays as day, idx}
        <div class="env-card flex flex-col overflow-hidden rounded-lg border">
          <button
            type="button"
            onclick={() => { cursor = day.date; view = 'day'; }}
            class="env-subtle env-border env-hover border-b py-3 text-center"
          >
            <div class="env-muted text-xs uppercase">{DAYS[idx]}</div>
            <div class="mx-auto mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold {day.ymd === todayYMD ? 'env-accent-bg font-bold' : 'env-text'}">
              {day.date.getDate()}
            </div>
          </button>
          <div
            role="button"
            tabindex="0"
            onclick={() => openCreateModal(day.ymd)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openCreateModal(day.ymd)}
            class="flex-1 cursor-pointer space-y-2 p-2.5"
          >
            {#each eventsForDate(day.ymd) as ev}
              <div
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectedEvent = ev; } }}
                class="env-accent-soft group/ev rounded-xl border border-[#48B17F]/30 p-2.5"
              >
                <div class="flex items-start justify-between gap-1">
                  {#if !ev.showWithoutTime}
                    <div class="font-mono text-xs">{formatTime(ev.start)}</div>
                  {:else}
                    <div></div>
                  {/if}
                  {#if ev.id}
                    <button
                      type="button"
                      title="Supprimer"
                      aria-label="Supprimer {ev.title}"
                      onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                      class="rounded px-1.5 py-0.5 text-xs opacity-75 hover:bg-red-500/15 hover:text-red-400 group-hover/ev:opacity-100"
                    >
                      🗑️
                    </button>
                  {/if}
                </div>
                <div class="env-text text-xs font-semibold">{badgeFor(ev)}{ev.title}</div>
                {#if ev.description}<div class="env-muted mt-0.5 truncate text-xs">{ev.description}</div>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  {:else}
    <div class="flex-1 overflow-y-auto p-5">
      <div class="env-card env-divider mx-auto max-w-3xl divide-y rounded-xl border p-2">
        {#each HOURS as h}
          {@const hourStr = String(h).padStart(2, '0')}
          {@const dayYmd = toYMD(cursor)}
          {@const slotEvents = eventsForDate(dayYmd).filter((e) => formatTime(e.start).startsWith(hourStr))}
          <div
            role="button"
            tabindex="0"
            onclick={() => openCreateModal(dayYmd, hourStr)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openCreateModal(dayYmd, hourStr)}
            class="env-hover flex min-h-14 cursor-pointer items-start gap-4 rounded-lg px-4 py-2.5 transition-colors"
          >
            <span class="env-faint w-14 shrink-0 font-mono text-xs">{hourStr}:00</span>
            <div class="flex-1 space-y-1.5">
              {#each slotEvents as ev}
                <div
                  role="button"
                  tabindex="0"
                  onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectedEvent = ev; } }}
                  class="env-accent-soft rounded-xl border border-[#48B17F]/40 px-3.5 py-2"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="env-text text-sm font-semibold">{badgeFor(ev)}{ev.title}</span>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs">{formatTime(ev.start)}</span>
                      {#if ev.id}
                        <button
                          type="button"
                          title="Supprimer"
                          aria-label="Supprimer {ev.title}"
                          onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                          class="rounded-lg px-1.5 py-0.5 text-xs hover:bg-red-500/15 hover:text-red-400"
                        >
                          🗑️
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if ev.description}<p class="env-muted mt-0.5 text-xs">{ev.description}</p>{/if}
                  {#if ev.participants && Object.keys(ev.participants).length > 0}
                    <p class="env-faint mt-1 text-xs">
                      👥 {Object.values(ev.participants).map((p) => p.email || p.name).filter(Boolean).join(', ')}
                    </p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if selectedEvent}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="cal-detail-title"
    tabindex="-1"
    onclick={() => (selectedEvent = null)}
    onkeydown={(e) => e.key === 'Escape' && (selectedEvent = null)}
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
  >
    <div
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      class="env-card w-full max-w-md space-y-4 rounded-xl border p-7 shadow-2xl"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 id="cal-detail-title" class="env-text text-lg font-semibold">{badgeFor(selectedEvent)}{selectedEvent.title}</h3>
          <p class="env-accent-text mt-1 font-mono text-xs font-medium">
            {selectedEvent.start ? new Date(selectedEvent.start).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: selectedEvent.showWithoutTime ? undefined : 'short' }) : ''}
          </p>
        </div>
        <button type="button" onclick={() => (selectedEvent = null)} aria-label="Fermer" class="env-muted env-hover rounded-xl px-2 py-1 text-sm">✕</button>
      </div>
      {#if selectedEvent.description}
        <p class="env-subtle env-text whitespace-pre-wrap rounded-lg border p-3.5 text-sm">{selectedEvent.description}</p>
      {/if}
      {#if selectedEvent.participants && Object.keys(selectedEvent.participants).length > 0}
        <p class="env-muted text-xs">
          👥 {Object.values(selectedEvent.participants).map((p) => p.email || p.name).filter(Boolean).join(', ')}
        </p>
      {/if}
      <div class="flex justify-between pt-2">
        {#if selectedEvent.id}
          <button
            type="button"
            onclick={() => (eventToDelete = selectedEvent)}
            class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20"
          >
            🗑️ Supprimer
          </button>
        {:else}
          <div></div>
        {/if}
        <button type="button" onclick={() => (selectedEvent = null)} class="env-input env-hover rounded-xl border px-4 py-2 text-xs font-medium">Fermer</button>
      </div>
    </div>
  </div>
{/if}

{#if showModal}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="cal-create-title"
    tabindex="-1"
    onclick={() => !saving && (showModal = false)}
    onkeydown={(e) => e.key === 'Escape' && !saving && (showModal = false)}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
  >
    <div role="presentation" onclick={(e) => e.stopPropagation()} class="w-full max-w-md">
      <form onsubmit={handleSave} class="env-card space-y-4 rounded-xl border p-7 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 id="cal-create-title" class="env-text text-lg font-semibold">Nouvel élément</h3>
      <button type="button" onclick={() => (showModal = false)} aria-label="Fermer" class="env-muted env-hover rounded-xl px-2 py-1 text-sm">✕</button>
        </div>

        <div class="env-subtle env-border grid grid-cols-3 gap-1.5 rounded-lg border p-1 text-xs">
          <button type="button" onclick={() => (kind = 'event')} class="rounded-xl py-2 font-medium {kind === 'event' ? 'env-accent-soft font-semibold' : 'env-muted'}">
            📅 Événement
          </button>
          <button type="button" onclick={() => (kind = 'task')} class="rounded-xl py-2 font-medium {kind === 'task' ? 'env-accent-soft font-semibold' : 'env-muted'}">
            ✅ Tâche
          </button>
          <button type="button" onclick={() => (kind = 'birthday')} class="rounded-xl py-2 font-medium {kind === 'birthday' ? 'env-accent-soft font-semibold' : 'env-muted'}">
            🎂 Anniversaire
          </button>
        </div>

        <div class="space-y-3">
          <input
            bind:value={title}
            aria-label="Titre"
            placeholder={kind === 'birthday' ? 'Nom de la personne' : kind === 'task' ? 'Titre de la tâche' : "Titre de l'événement"}
            required
            class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
          />
          <input
            bind:value={start}
            type="datetime-local"
            aria-label="Date et heure"
            required
            class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
          />
          {#if kind === 'event'}
            <div>
              <label for="cal-invitees" class="env-muted mb-1.5 block text-xs">Inviter des participants (emails séparés par des virgules)</label>
              <div class="relative">
                <input
                  id="cal-invitees"
                  bind:value={inviteesText}
                  onfocus={() => (showInviteeDropdown = true)}
                  oninput={() => (showInviteeDropdown = true)}
                  onblur={() => setTimeout(() => (showInviteeDropdown = false), 160)}
                  placeholder="alice@domaine.fr, bob@domaine.fr"
                  autocomplete="off"
                  class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
                />
                {#if showInviteeDropdown && inviteeSuggestions.length > 0}
                  <div role="listbox" class="env-card absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border shadow-2xl">
                    {#each inviteeSuggestions as s}
                      <button
                        type="button"
                        onmousedown={(e) => { e.preventDefault(); applyInviteeSuggestion(s.email); }}
                        class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left text-xs"
                      >
                        <span class="env-text font-medium">{s.name}</span>
                        <span class="env-accent-text">{s.email}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
          <textarea
            bind:value={description}
            rows="3"
            aria-label="Notes"
            placeholder="Notes (optionnel)"
            class="env-input w-full rounded-lg border p-3 text-sm"
          ></textarea>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" onclick={() => (showModal = false)} class="env-muted env-hover rounded-xl px-4 py-2 text-xs">Annuler</button>
          <button disabled={saving} class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
  {#if inviteSendStatus}
    <p role="status" class="env-accent-soft mt-3 rounded-xl px-4 py-2.5 text-xs font-medium">{inviteSendStatus}</p>
  {/if}
  {#if inviteFeedback}
    <p role="status" class="env-accent-soft mt-3 rounded-lg px-3.5 py-2 text-xs font-medium">{inviteFeedback}</p>
  {/if}
  {#if inviteNotice}
    <p role="status" class="env-accent-soft mt-3 rounded-lg px-3.5 py-2 text-xs font-medium">{inviteNotice}</p>
  {/if}
    </div>
  </div>
{/if}

{#if eventToDelete}
  <ConfirmModal
    title="Supprimer l'élément du calendrier"
    message={'Voulez-vous vraiment supprimer « ' + eventToDelete.title + ' » ? Cette action est définitive.'}
    confirmLabel="Supprimer"
    onConfirm={confirmDeleteEvent}
    onCancel={() => (eventToDelete = null)}
  />
{/if}
