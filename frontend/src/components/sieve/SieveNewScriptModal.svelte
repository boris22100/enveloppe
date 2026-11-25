<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  let {
    open = false,
    title = $bindable(''),
    onSubmit,
    onClose
  }: {
    open?: boolean;
    title?: string;
    onSubmit: (e: Event) => void;
    onClose: () => void;
  } = $props();
</script>

{#if open}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="new-sieve-title"
    tabindex="-1"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
  >
    <div
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      class="w-full max-w-sm"
    >
      <form
        onsubmit={onSubmit}
        class="env-card space-y-4 rounded-xl border p-7 shadow-2xl"
      >
        <h3 id="new-sieve-title" class="env-text text-lg font-semibold">{t('sieve.newScriptModalTitle', undefined, activeLocale)}</h3>
        <input
          bind:value={title}
          aria-label={t('sieve.newScriptNameAria', undefined, activeLocale)}
          placeholder="Ex : vacances, tri-pro, enveloppe"
          required
          class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
        />
        <div class="flex justify-end gap-2">
          <button type="button" onclick={onClose} class="env-muted env-hover rounded-xl px-4 py-2 text-xs">Annuler</button>
          <button class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold">{t('common.create', undefined, activeLocale)}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
