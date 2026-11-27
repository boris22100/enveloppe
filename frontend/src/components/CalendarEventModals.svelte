<script lang="ts">
  import ConfirmModal from './ConfirmModal.svelte';
  import type { JSCalendarEvent } from '../lib/jmap/calendar';

  export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

  type CalendarEventExt = JSCalendarEvent & {
    uid?: string;
    summary?: string;
    dtstart?: string;
    sequence?: number;
  };

  let {
    selectedEvent = $bindable<CalendarEventExt | null>(null),
    showModal = $bindable(false),
    kind = $bindable<'event' | 'task' | 'birthday'>('event'),
    title = $bindable(''),
    start = $bindable(''),
    rangeEndTime = $bindable(''),
    description = $bindable(''),
    participantsInput = $bindable(''),
    inviteesText = $bindable(''),
    createRecurrencePreset = $bindable<RecurrencePreset>('none'),
    createDurationMinutes = $bindable(60),
    saving = false,
    inviteSendStatus = '',
    editingEvent = $bindable<CalendarEventExt | null>(null),
    editTitle = $bindable(''),
    editStart = $bindable(''),
    editDescription = $bindable(''),
    editInviteesText = $bindable(''),
    editIcsStatus = $bindable<{ kind: 'idle' | 'sending' | 'ok' | 'error'; message: string }>({
      kind: 'idle',
      message: ''
    }),
    updating = false,
    eventToDelete = $bindable<CalendarEventExt | null>(null),
    onBadgeFor,
    onTaskProgressOf,
    onToggleTaskDone,
    onOpenEditModal,
    onHandleSave,
    onHandleUpdateSave,
    onRemoveEditInvitee,
    onConfirmDeleteEvent,
    onExtractParticipantEmails,
    onParseInvitees
  }: {
    selectedEvent?: CalendarEventExt | null;
    showModal?: boolean;
    kind?: 'event' | 'task' | 'birthday';
    title?: string;
    start?: string;
    rangeEndTime?: string;
    description?: string;
    participantsInput?: string;
    inviteesText?: string;
    createRecurrencePreset?: RecurrencePreset;
    createDurationMinutes?: number;
    saving?: boolean;
    inviteSendStatus?: string;
    editingEvent?: CalendarEventExt | null;
    editTitle?: string;
    editStart?: string;
    editDescription?: string;
    editInviteesText?: string;
    editIcsStatus?: { kind: 'idle' | 'sending' | 'ok' | 'error'; message: string };
    updating?: boolean;
    eventToDelete?: CalendarEventExt | null;
    onBadgeFor: (ev: JSCalendarEvent) => string;
    onTaskProgressOf: (ev: JSCalendarEvent) => string;
    onToggleTaskDone: (ev: JSCalendarEvent) => Promise<void> | void;
    onOpenEditModal: (ev: JSCalendarEvent) => void;
    onHandleSave: (e: Event) => Promise<void> | void;
    onHandleUpdateSave: (e: Event) => Promise<void> | void;
    onRemoveEditInvitee: (email: string) => void;
    onConfirmDeleteEvent: () => Promise<void> | void;
    onExtractParticipantEmails: (ev: JSCalendarEvent | Record<string, unknown>) => string[];
    onParseInvitees: (raw: string) => string[];
  } = $props();
</script>

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
          <h3 id="cal-detail-title" class="env-text text-lg font-semibold">{onBadgeFor(selectedEvent)}{selectedEvent.title}</h3>
          <p class="env-accent-text mt-1 font-mono text-xs font-medium">
            {selectedEvent.start ? new Date(selectedEvent.start).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: selectedEvent.showWithoutTime ? undefined : 'short' }) : ''}
          </p>
        </div>
        <div class="flex items-center gap-2">
          {#if selectedEvent.id && selectedEvent.categories?.['Tâche']}
            <button
              type="button"
              onclick={() => { const cur = selectedEvent; selectedEvent = null; if (cur) void onToggleTaskDone(cur); }}
              class="rounded-xl border px-3 py-1 text-xs font-semibold env-btn-secondary"
            >
              {onTaskProgressOf(selectedEvent) === 'completed' ? 'Marquer à faire' : 'Marquer terminée'}
            </button>
          {/if}
          <button type="button" onclick={() => (selectedEvent = null)} aria-label="Fermer" class="env-muted env-hover rounded-xl px-2 py-1 text-sm">✕</button>
        </div>
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
        <div class="flex items-center gap-2">
          {#if selectedEvent.id}
            <button
              type="button"
              onclick={() => onOpenEditModal(selectedEvent!)}
              class="env-input env-hover rounded-xl border px-4 py-2 text-xs font-medium"
            >
              ✏️ Modifier
            </button>
          {/if}
          <button type="button" onclick={() => (selectedEvent = null)} class="env-input env-hover rounded-xl border px-4 py-2 text-xs font-medium">Fermer</button>
        </div>
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
      <form onsubmit={onHandleSave} class="env-card space-y-4 rounded-xl border p-7 shadow-2xl">
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
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="space-y-1">
              <span class="env-muted block">Récurrence</span>
              <select bind:value={createRecurrencePreset} class="env-input w-full rounded-lg border px-2.5 py-1.5">
                <option value="none">Aucune</option>
                <option value="daily">Quotidienne</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
                <option value="yearly">Annuelle</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="env-muted block">Durée (min)</span>
              <input type="number" min="5" max="1440" step="5" bind:value={createDurationMinutes} class="env-input w-full rounded-lg border px-2.5 py-1.5" />
            </label>
          </div>
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
                  placeholder="alice@domaine.fr, bob@domaine.fr"
                  autocomplete="off"
                  class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
                />
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
    </div>
  </div>
{/if}


{#if editingEvent}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="cal-edit-title"
    tabindex="-1"
    onclick={() => !updating && (editingEvent = null)}
    onkeydown={(e) => e.key === 'Escape' && !updating && (editingEvent = null)}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
  >
    <div role="presentation" onclick={(e) => e.stopPropagation()} class="w-full max-w-md">
      <form onsubmit={onHandleUpdateSave} class="env-card space-y-4 rounded-xl border p-7 shadow-2xl">
        <div class="flex items-center justify-between">
          <h3 id="cal-edit-title" class="env-text text-lg font-semibold">Modifier l'événement</h3>
          <button type="button" onclick={() => (editingEvent = null)} aria-label="Fermer" class="env-muted env-hover rounded-xl px-2 py-1 text-sm">✕</button>
        </div>

        <div class="space-y-3">
          <input
            bind:value={editTitle}
            aria-label="Titre"
            placeholder="Titre de l'événement"
            required
            class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
          />
          <input
            bind:value={editStart}
            type="datetime-local"
            aria-label="Date et heure"
            required
            class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
          />
          <div>
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <label for="cal-edit-invitees" class="env-muted block text-xs">
                Participants (emails séparés par des virgules)
              </label>
              <span class="env-faint font-mono text-[11px]">{onParseInvitees(editInviteesText).length}</span>
            </div>
            {#if onParseInvitees(editInviteesText).length > 0}
              <div class="mb-2 flex flex-wrap gap-1.5">
                {#each onParseInvitees(editInviteesText) as em}
                  <span class="env-accent-soft env-accent-text inline-flex items-center gap-1.5 rounded-full border border-[#48B17F]/35 px-2.5 py-0.5 text-xs">
                    <span>{em}</span>
                    <button
                      type="button"
                      title="Retirer {em}"
                      aria-label="Retirer {em}"
                      onclick={() => onRemoveEditInvitee(em)}
                      class="rounded-full px-1 text-[11px] opacity-75 hover:bg-black/15 hover:opacity-100"
                    >
                      ✕
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
            <input
              id="cal-edit-invitees"
              bind:value={editInviteesText}
              placeholder="alice@domaine.fr, bob@domaine.fr"
              autocomplete="off"
              class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
            />
          </div>
          <textarea
            bind:value={editDescription}
            rows="3"
            aria-label="Notes"
            placeholder="Notes (optionnel)"
            class="env-input w-full rounded-lg border p-3 text-sm"
          ></textarea>
        </div>

        {#if editIcsStatus.kind !== 'idle'}
          <p
            role="status"
            class={editIcsStatus.kind === 'error'
              ? 'rounded-xl bg-red-500/15 px-3.5 py-2 text-xs font-medium text-red-400'
              : 'env-accent-soft env-accent-text rounded-xl border border-[#48B17F]/30 px-3.5 py-2 text-xs font-medium'}
          >
            {editIcsStatus.message}
          </p>
        {/if}

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" onclick={() => (editingEvent = null)} class="env-muted env-hover rounded-xl px-4 py-2 text-xs">Annuler</button>
          <button disabled={updating} class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50">
            {updating ? 'Mise à jour...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if eventToDelete}
  <ConfirmModal
    title="Supprimer l'élément du calendrier"
    message={'Voulez-vous vraiment supprimer « ' + eventToDelete.title + ' » ? Cette action est définitive.'}
    confirmLabel="Supprimer"
    onConfirm={onConfirmDeleteEvent}
    onCancel={() => (eventToDelete = null)}
  />
{/if}
