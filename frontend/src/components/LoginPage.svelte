<script lang="ts">
  let { onLoggedIn }: { onLoggedIn: () => void } = $props();
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
        body: JSON.stringify({ label: label || username, host, username, password, color })
      });
      if (!res.ok) throw new Error(await res.text());
      onLoggedIn();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-[#08101A] p-4">
  <form onsubmit={submit} class="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-8 shadow-2xl">
    <div class="space-y-1">
      <div class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0D3A4D] text-[#48B17F] text-lg font-bold">✉️</div>
      <h1 class="text-2xl font-bold text-white">Enveloppe</h1>
      <p class="text-xs text-slate-400">Renseignez vos identifiants de connexion pour accéder à votre messagerie.</p>
    </div>

    {#if error}
      <p class="rounded-lg bg-red-500/15 p-3 text-xs text-red-300">{error}</p>
    {/if}

    <div class="space-y-3">
      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Nom du compte</label>
        <div class="grid grid-cols-4 gap-2">
          <input bind:value={label} placeholder="Ex : Perso, Pro..." required class="col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <input type="color" bind:value={color} title="Couleur du compte" class="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1" />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Nom du serveur</label>
        <input bind:value={host} placeholder="https://mail.mondomaine.fr" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Adresse mail</label>
        <input bind:value={username} type="email" placeholder="prenom@mondomaine.fr" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Mot de passe d'application</label>
        <input type="password" bind:value={password} placeholder="••••••••••••" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>
    </div>

    <button disabled={loading} class="w-full rounded-lg bg-[#48B17F] py-2.5 text-sm font-semibold text-[#08101A] hover:opacity-90 disabled:opacity-50">
      {loading ? 'Connexion en cours...' : 'Se connecter'}
    </button>
  </form>
</div>
