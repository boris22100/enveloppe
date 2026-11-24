<script lang="ts">
  interface SieveTemplateItem {
    label: string;
    description?: string;
  }

  let {
    templates = [],
    onSelect
  }: {
    templates?: SieveTemplateItem[];
    onSelect: (tpl: SieveTemplateItem) => void;
  } = $props();
</script>

{#if templates.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    <span class="env-muted text-xs font-medium">Modèles :</span>
    {#each templates as tpl}
      <button
        type="button"
        onclick={() => onSelect(tpl)}
        class="env-input env-hover rounded-lg border px-2.5 py-1 text-xs"
      >
        {tpl.label}
      </button>
    {/each}
  </div>
{/if}
