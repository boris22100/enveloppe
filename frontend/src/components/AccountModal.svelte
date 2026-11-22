<script lang="ts">
  let { onAdded, onClose }: { onAdded: () => void; onClose: () => void } = $props();

  let label = $state('');
  let host = $state('https://');
  let username = $state('');
  let password = $state('');
  let color = $state('#48B17F');
  let loading = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, host, username, password, color })
      });
      if (!res.ok) throw new Error(await res.text());
      onAdded();
      onClose();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
  <form onsubmit={submit} class="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-6 shadow-2xl">
    <h3 class="text-lg font-semibold text-white">Connecter un serveur JMAP (Stalwart)</h3>
    {#if error}
      <p class="rounded-lg bg-red-500/15 p-3 text-xs text-red-300">{error}</p>
    {/if}
    <div class="grid grid-cols-4 gap-3">
      <input bind:value={label} placeholder="Nom (ex: Perso)" required class="col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      <input type="color" bind:value={color} class="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1" />
    </div>
    <input bind:value={host} placeholder="https://mail.mondomaine.fr" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
    <input bind:value={username} placeholder="Identifiant / Email" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
    <input type="password" bind:value={password} placeholder="Mot de passe d'application" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" onclick={onClose} class="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">Annuler</button>
      <button disabled={loading} class="rounded-lg bg-[#48B17F] px-4 py-2 text-sm font-medium text-[#0B1622] hover:opacity-90 disabled:opacity-50">
        {loading ? 'Découverte JMAP...' : 'Connecter'}
      </button>
    </div>
  </form>
</div>
