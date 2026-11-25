<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  import type { SieveVacation } from '../../lib/utils/sieveGenerator';

  let {
    vacation = $bindable(),
    onChange
  }: {
    vacation: SieveVacation;
    onChange: () => void;
  } = $props();
</script>

<div class="env-card space-y-3 rounded-xl border p-5 shadow-xs">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <input
        id="vac-toggle"
        type="checkbox"
        bind:checked={vacation.enabled}
        onchange={onChange}
        class="h-4 w-4 accent-[#48B17F]"
      />
      <label for="vac-toggle" class="env-text text-sm font-semibold">
        Répondeur automatique (Absence du bureau)
      </label>
    </div>
    <span class="env-muted text-xs">Extension Sieve <code class="font-mono">vacation</code></span>
  </div>

  {#if vacation.enabled}
    <div class="grid gap-3 pt-2 sm:grid-cols-4">
      <div>
        <label for="vac-days" class="env-muted mb-1 block text-xs">{t('sieve.repeatDays', undefined, activeLocale)}</label>
        <input
          id="vac-days"
          type="number"
          min="1"
          max="30"
          bind:value={vacation.days}
          oninput={onChange}
          class="env-input w-full rounded-xl border px-3 py-2 text-xs"
        />
      </div>
      <div class="sm:col-span-3">
        <label for="vac-subject" class="env-muted mb-1 block text-xs">{t('sieve.replySubject', undefined, activeLocale)}</label>
        <input
          id="vac-subject"
          type="text"
          bind:value={vacation.subject}
          oninput={onChange}
          placeholder={t('sieve.outOfOffice', undefined, activeLocale)}
          class="env-input w-full rounded-xl border px-3 py-2 text-xs"
        />
      </div>
      <div class="sm:col-span-4">
        <label for="vac-reason" class="env-muted mb-1 block text-xs">{t('sieve.absenceMessage', undefined, activeLocale)}</label>
        <textarea
          id="vac-reason"
          rows="3"
          bind:value={vacation.reason}
          oninput={onChange}
          placeholder="Bonjour, je suis actuellement absent..."
          class="env-input w-full rounded-xl border px-3 py-2 text-xs"
        ></textarea>
      </div>
    </div>
  {/if}
</div>
