<script lang="ts">
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

  let { accountId }: { accountId: string } = $props();

  let defaultCalId = $state('');
  let events = $state<JSCalendarEvent[]>([]);
  let view = $state<'month' | 'week' | 'day'>('month');
  let cursor = $state(new Date());

  let showModal = $state(false);
  let kind = $state<CalendarItemKind>('event');
  let title = $state('');
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
    return `${y}-${m}-${day}`;
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
    start = `${ymd}T${hour}:00`;
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
      return `${mon.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} —${sun.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
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
    e.preventDefault();
    if (!defaultCalId) return;
    saving = true;
    try {
      const invitees = kind === 'event'
        ? inviteesText.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
        : [];
      await createEvent(accountId, defaultCalId, title, start, description, kind, invitees);
      showModal = false;
      await load();
    } finally {
      saving = false;
    }
  }

  async function confirmDeleteEvent() {
    if (!eventToDelete?.id) return;
    await deleteEvent(accountId, eventToDelete.id);
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
</script>

<div class="flex h-full flex-col overflow-hidden bg-[#0B1622]">
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
    <div class="flex items-center gap-3">
      <div class="flex items-center rounded-lg border border-slate-700 bg-slate-900">
        <button onclick={() => shift(-1)} class="px-2.5 py-1 text-sm text-slate-300 hover:text-white">‹</button>
        <button onclick={() => (cursor = new Date())} class="border-x border-slate-700 px-3 py-1 text-xs text-slate-200 hover:text-white">Aujourd'hui</button>
        <button onclick={() => shift(1)} class="px-2.5 py-1 text-sm text-slate-300 hover:text-white">›</button>
      </div>
      <h2 class="text-base font-bold capitalize text-white">{headerLabel}</h2>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
        <button onclick={() => (view = 'month')} class="rounded-md px-3 py-1 {view === 'month' ? 'bg-[#0D3A4D] font-semibold text-[#48B17F]' : 'text-slate-400 hover:text-white'}">Mois</button>
        <button onclick={() => (view = 'week')} class="rounded-md px-3 py-1 {view === 'week' ? 'bg-[#0D3A4D] font-semibold text-[#48B17F]' : 'text-slate-400 hover:text-white'}">Semaine</button>
        <button onclick={() => (view = 'day')} class="rounded-md px-3 py-1 {view === 'day' ? 'bg-[#0D3A4D] font-semibold text-[#48B17F]' : 'text-slate-400 hover:text-white'}">Jour</button>
      </div>

      <button onclick={() => openCreateModal(toYMD(cursor))} class="rounded-lg bg-[#48B17F] px-3 py-1.5 text-xs font-semibold text-[#08101A]">+ Nouveau</button>
      <button onclick={() => downloadFile(eventsToIcs(events), 'calendrier.ics', 'text/calendar')} class="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#48B17F]">.ics</button>
      <label class="cursor-pointer rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#48B17F]">
        Importer
        <input type="file" accept=".ics,.json" onchange={handleImport} class="hidden" />
      </label>
    </div>
  </header>

  <!-- VUE MOIS -->
  {#if view === 'month'}
    <div class="grid grid-cols-7 border-b border-slate-800 bg-[#0A131E] text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {#each DAYS as d}<div class="py-2">{d}</div>{/each}
    </div>
    <div class="grid flex-1 grid-cols-7 grid-rows-6 divide-x divide-y divide-slate-800/70 overflow-hidden">
      {#each monthCells as cell}
        <div
          role="button"
          tabindex="0"
          onclick={() => openCreateModal(cell.ymd)}
          onkeydown={(e) => e.key === 'Enter' && openCreateModal(cell.ymd)}
          class="flex cursor-pointer flex-col overflow-hidden p-1.5 text-left transition-colors hover:bg-slate-800/35 {cell.inMonth ? '' : 'bg-[#08101A]/60 opacity-45'}"
        >
          <button
            type="button"
            title="Voir cette journée"
            onclick={(e) => { e.stopPropagation(); cursor = cell.date; view = 'day'; }}
            class="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs hover:ring-1 hover:ring-[#48B17F] {cell.ymd === todayYMD ? 'bg-[#48B17F] font-bold text-[#08101A]' : 'text-slate-300'}"
          >
            {cell.date.getDate()}
          </button>
          <div class="space-y-1 overflow-y-auto">
            {#each eventsForDate(cell.ymd).slice(0, 3) as ev}
              <div
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); selectedEvent = ev; } }}
                class="group/ev flex items-center justify-between gap-1 rounded bg-[#0D3A4D] px-1.5 py-0.5 text-[11px] text-[#48B17F] hover:bg-[#114a62]"
              >
                <span class="truncate">
                  {badgeFor(ev)}{#if !ev.showWithoutTime}<span class="font-mono text-[10px] text-slate-300">{formatTime(ev.start)} </span>{/if}{ev.title}
                </span>
                {#if ev.id}
                  <button
                    type="button"
                    title="Supprimer"
                    onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                    class="shrink-0 text-[10px] text-slate-400 opacity-0 hover:text-red-400 group-hover/ev:opacity-100"
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

  <!-- VUE SEMAINE -->
  {:else if view === 'week'}
    <div class="grid flex-1 grid-cols-7 divide-x divide-slate-800/80 overflow-y-auto">
      {#each weekDays as day, idx}
        <div class="flex flex-col">
          <button
            onclick={() => { cursor = day.date; view = 'day'; }}
            class="border-b border-slate-800 bg-[#0A131E] py-2.5 text-center hover:bg-slate-800/50"
          >
            <div class="text-[11px] uppercase text-slate-400">{DAYS[idx]}</div>
            <div class="mx-auto mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold {day.ymd === todayYMD ? 'bg-[#48B17F] text-[#08101A]' : 'text-white'}">
              {day.date.getDate()}
            </div>
          </button>
          <div
            role="button"
            tabindex="0"
            onclick={() => openCreateModal(day.ymd)}
            onkeydown={(e) => e.key === 'Enter' && openCreateModal(day.ymd)}
            class="flex-1 cursor-pointer space-y-2 p-2 hover:bg-slate-800/20"
          >
            {#each eventsForDate(day.ymd) as ev}
              <div
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); selectedEvent = ev; } }}
                class="group/ev rounded-lg border border-[#48B17F]/30 bg-[#0D3A4D]/60 p-2 hover:border-[#48B17F]"
              >
                <div class="flex items-start justify-between gap-1">
                  {#if !ev.showWithoutTime}
                    <div class="font-mono text-[10px] text-[#48B17F]">{formatTime(ev.start)}</div>
                  {:else}
                    <div></div>
                  {/if}
                  {#if ev.id}
                    <button
                      type="button"
                      title="Supprimer"
                      onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                      class="rounded px-1 text-[10px] text-slate-400 opacity-70 hover:bg-red-500/15 hover:text-red-400 group-hover/ev:opacity-100"
                    >
                      🗑️
                    </button>
                  {/if}
                </div>
                <div class="text-xs font-semibold text-white">{badgeFor(ev)}{ev.title}</div>
                {#if ev.description}<div class="mt-0.5 truncate text-[11px] text-slate-400">{ev.description}</div>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  <!-- VUE JOUR -->
  {:else}
    <div class="flex-1 overflow-y-auto p-4">
      <div class="mx-auto max-w-3xl divide-y divide-slate-800/70 rounded-xl border border-slate-800 bg-[#0D1B2A]">
        {#each HOURS as h}
          {@const hourStr = String(h).padStart(2, '0')}
          {@const dayYmd = toYMD(cursor)}
          {@const slotEvents = eventsForDate(dayYmd).filter((e) => formatTime(e.start).startsWith(hourStr))}
          <div
            role="button"
            tabindex="0"
            onclick={() => openCreateModal(dayYmd, hourStr)}
            onkeydown={(e) => e.key === 'Enter' && openCreateModal(dayYmd, hourStr)}
            class="flex min-h-14 cursor-pointer items-start gap-4 px-4 py-2 transition-colors hover:bg-slate-800/35"
          >
            <span class="w-12 shrink-0 font-mono text-xs text-slate-500">{hourStr}:00</span>
            <div class="flex-1 space-y-1.5">
              {#each slotEvents as ev}
                <div
                  role="button"
                  tabindex="0"
                  onclick={(e) => { e.stopPropagation(); selectedEvent = ev; }}
                  onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); selectedEvent = ev; } }}
                  class="rounded-lg border border-[#48B17F]/40 bg-[#0D3A4D]/80 px-3 py-2"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-white">{badgeFor(ev)}{ev.title}</span>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs text-[#48B17F]">{formatTime(ev.start)}</span>
                      {#if ev.id}
                        <button
                          type="button"
                          title="Supprimer"
                          onclick={(e) => { e.stopPropagation(); eventToDelete = ev; }}
                          class="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-500/15 hover:text-red-400"
                        >
                          🗑️
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if ev.description}<p class="mt-0.5 text-xs text-slate-300">{ev.description}</p>{/if}
                  {#if ev.participants && Object.keys(ev.participants).length > 0}
                    <p class="mt-1 text-[11px] text-slate-400">
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
    onclick={() => (selectedEvent = null)}
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
  >
    <div
      onclick={(e) => e.stopPropagation()}
      class="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-6 shadow-2xl"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-white">{badgeFor(selectedEvent)}{selectedEvent.title}</h3>
          <p class="mt-0.5 font-mono text-xs text-[#48B17F]">
            {selectedEvent.start ? new Date(selectedEvent.start).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: selectedEvent.showWithoutTime ? undefined : 'short' }) : ''}
          </p>
        </div>
        <button type="button" onclick={() => (selectedEvent = null)} class="text-slate-400 hover:text-white">✕</button>
      </div>
      {#if selectedEvent.description}
        <p class="whitespace-pre-wrap rounded-lg bg-slate-900/80 p-3 text-xs text-slate-300">{selectedEvent.description}</p>
      {/if}
      {#if selectedEvent.participants && Object.keys(selectedEvent.participants).length > 0}
        <p class="text-xs text-slate-400">
          👥 {Object.values(selectedEvent.participants).map((p) => p.email || p.name).filter(Boolean).join(', ')}
        </p>
      {/if}
      <div class="flex justify-between pt-2">
        {#if selectedEvent.id}
          <button
            type="button"
            onclick={() => (eventToDelete = selectedEvent)}
            class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
          >
            🗑️ Supprimer
          </button>
        {:else}
          <div></div>
        {/if}
        <button type="button" onclick={() => (selectedEvent = null)} class="rounded-lg bg-slate-800 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-700">Fermer</button>
      </div>
    </div>
  </div>
{/if}

{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <form onsubmit={handleSave} class="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-6 shadow-2xl">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-white">Nouvel élément</h3>
        <button type="button" onclick={() => (showModal = false)} class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-900 p-1 text-xs">
        <button type="button" onclick={() => (kind = 'event')} class="rounded-lg py-1.5 font-medium {kind === 'event' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          📅 Événement
        </button>
        <button type="button" onclick={() => (kind = 'task')} class="rounded-lg py-1.5 font-medium {kind === 'task' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          ✅ Tâche
        </button>
        <button type="button" onclick={() => (kind = 'birthday')} class="rounded-lg py-1.5 font-medium {kind === 'birthday' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          🎂 Anniversaire
        </button>
      </div>

      <div class="space-y-3">
        <input
          bind:value={title}
          placeholder={kind === 'birthday' ? 'Nom de la personne' : kind === 'task' ? 'Titre de la tâche' : "Titre de l'événement"}
          required
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        <input
          bind:value={start}
          type="datetime-local"
          required
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        {#if kind === 'event'}
          <div>
            <label class="mb-1 block text-xs text-slate-400">Inviter des participants (emails séparés par des virgules)</label>
            <input
              bind:value={inviteesText}
              placeholder="alice@domaine.fr, bob@domaine.fr"
              class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </div>
        {/if}
        <textarea
          bind:value={description}
          rows="3"
          placeholder="Notes (optionnel)"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm text-white"
        ></textarea>
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <button type="button" onclick={() => (showModal = false)} class="rounded-lg px-4 py-2 text-xs text-slate-400 hover:text-white">Annuler</button>
        <button disabled={saving} class="rounded-lg bg-[#48B17F] px-4 py-2 text-xs font-semibold text-[#08101A] disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  </div>
{/if}

{#if eventToDelete}
  <ConfirmModal
    title="Supprimer l'élément du calendrier"
    message={`Voulez-vous vraiment supprimer « ${eventToDelete.title} » ? Cette action est définitive.`}
    confirmLabel="Supprimer"
    onConfirm={confirmDeleteEvent}
    onCancel={() => (eventToDelete = null)}
  />
{/if}
