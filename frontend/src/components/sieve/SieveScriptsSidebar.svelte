<script lang="ts">
  import { t } from '../../lib/i18n';
  export interface SieveScriptItem {
    id?: string;
    name: string;
    isActive?: boolean;
  }

  let {
    scripts = [],
    selectedName = '',
    onSelect,
    onNew
  }: {
    scripts?: SieveScriptItem[];
    selectedName?: string;
    onSelect: (sc: SieveScriptItem) => void;
    onNew: () => void;
  } = $props();
</script>

<aside class="env-border flex w-64 shrink-0 flex-col border-r">
  <div class="env-border flex items-center justify-between border-b px-4 py-3">
    <span class="env-text text-xs font-semibold uppercase tracking-wider">Scripts Sieve</span>
    <button
      type="button"
      onclick={onNew}
      title="Nouveau script"
      aria-label="Nouveau script Sieve"
      class="env-accent-soft rounded-lg px-2.5 py-1 text-xs font-semibold"
    >
      {t('calendar.newShort', undefined, activeLocale)}
    </button>
  </div>
  <div class="flex-1 space-y-1 overflow-y-auto p-2">
    {#each scripts as sc}
      <button
        type="button"
        onclick={() => onSelect(sc)}
        class="env-hover flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs {sc.name === selectedName ? 'env-accent-soft font-semibold' : 'env-text'}"
      >
        <span class="truncate">{sc.name}</span>
        {#if sc.isActive}
          <span class="ml-2 shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">Actif</span>
        {/if}
      </button>
    {/each}
  </div>
</aside>
