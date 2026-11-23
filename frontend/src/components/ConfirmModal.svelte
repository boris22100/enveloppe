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
  onclick={() => !busy && onCancel()}
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
>
  <div
    onclick={(e) => e.stopPropagation()}
    class="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-6 shadow-2xl"
  >
    <div class="space-y-1.5">
      <h3 class="text-base font-semibold text-white">{title}</h3>
      <p class="text-xs leading-relaxed text-slate-300">{message}</p>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button
        type="button"
        disabled={busy}
        onclick={onCancel}
        class="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        type="button"
        disabled={busy}
        onclick={handleConfirm}
        class="rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50 {danger ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-[#48B17F] text-[#08101A] hover:opacity-90'}"
      >
        {busy ? 'Traitement...' : confirmLabel}
      </button>
    </div>
  </div>
</div>
