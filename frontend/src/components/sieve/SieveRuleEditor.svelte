<script lang="ts">
  let {
    name = $bindable(''),
    enabled = $bindable(true),
    onSave,
    onCancel
  }: {
    name?: string;
    enabled?: boolean;
    onSave: () => void;
    onCancel: () => void;
  } = $props();
</script>

<div class="env-card space-y-3 rounded-xl border p-4">
  <div class="flex items-center justify-between">
    <h4 class="env-text text-sm font-semibold">Édition de règle Sieve</h4>
    <label class="env-muted flex items-center gap-2 text-xs">
      <input type="checkbox" bind:checked={enabled} />
      <span>Active</span>
    </label>
  </div>
  <input
    type="text"
    bind:value={name}
    placeholder="Nom de la règle"
    aria-label="Nom de la règle Sieve"
    class="env-input w-full rounded-lg border px-3 py-2 text-sm"
  />
  <div class="flex justify-end gap-2">
    <button type="button" onclick={onCancel} class="env-muted env-hover rounded-lg border px-3 py-1.5 text-xs">
      Annuler
    </button>
    <button type="button" onclick={onSave} class="env-accent-soft rounded-lg px-3 py-1.5 text-xs font-semibold">
      Enregistrer
    </button>
  </div>
</div>
