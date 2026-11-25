<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  export interface SieveTemplateEntry {
    label: string;
    description?: string;
    code: string;
  }

  let {
    templates = [],
    onApply
  }: {
    templates?: SieveTemplateEntry[];
    onApply: (tpl: SieveTemplateEntry) => void;
  } = $props();
</script>

{#if templates.length > 0}
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <span class="env-muted text-xs font-semibold uppercase tracking-wider">{t('sieve.templates', undefined, activeLocale)}</span>
    {#each templates as tpl}
      <button
        type="button"
        title={tpl.description}
        onclick={() => onApply(tpl)}
        class="env-input env-hover rounded-xl border px-3 py-1.5 text-xs font-medium"
      >
        {tpl.label}
      </button>
    {/each}
  </div>
{/if}
