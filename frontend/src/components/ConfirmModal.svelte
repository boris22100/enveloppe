<script lang="ts">
  let {
    title,
    message,
    confirmLabel = 'Supprimer',
    danger = true,
    onConfirm,
    onCancel
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
    onCancel: () => void;
  } = $props();

  let busy = $state(false);

  async function handleConfirm() {
    busy = true;
    try {
      await onConfirm();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && onCancel()} />

<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="confirm-modal-title"
  tabindex="-1"
  onclick={() => !busy && onCancel()}
  onkeydown={(e) => e.key === 'Escape' && !busy && onCancel()}
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
>
  <div
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    class="env-card w-full max-w-md space-y-4 rounded-xl border p-7 shadow-2xl"
  >
    <div class="space-y-1.5">
      <h3 id="confirm-modal-title" class="env-text text-lg font-semibold">{title}</h3>
      <p class="env-muted text-sm leading-relaxed">{message}</p>
    </div>
    <div class="flex justify-end gap-2.5 pt-2">
      <button
        type="button"
        disabled={busy}
        onclick={onCancel}
        class="env-input env-hover rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        type="button"
        disabled={busy}
        onclick={handleConfirm}
        class="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 {danger ? 'bg-red-600 text-white hover:bg-red-500' : 'env-accent-bg hover:opacity-90'}"
      >
        {busy ? 'Traitement...' : confirmLabel}
      </button>
    </div>
  </div>
</div>
