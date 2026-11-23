<script lang="ts">
  let { onLoggedIn }: { onLoggedIn: () => void } = $props();
  let label = $state('');
  let host = $state('https://');
  let username = $state('');
  let password = $state('');
  let color = $state('#48B17F');
  let loading = $state(false);
  let oidcSupported = $state(false);
  let checkingOidc = $state(false);
  let error = $state('');

  $effect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oidcErr = urlParams.get('oidc_error');
    if (oidcErr) {
      error = oidcErr;
      window.history.replaceState({}, '', window.location.pathname);
    }
  });

  $effect(() => {
    const clean = host.trim();
    if (!clean || clean === 'https://' || clean === 'http://' || !clean.includes('.')) {
      oidcSupported = false;
      return;
    }
    const timer = setTimeout(async () => {
      checkingOidc = true;
      try {
        const res = await fetch(`/api/auth/oidc/discover?host=${encodeURIComponent(clean)}`);
        if (res.ok) {
          const data = await res.json();
          oidcSupported = Boolean(data.supported);
        } else {
          oidcSupported = false;
        }
      } catch {
        oidcSupported = false;
      } finally {
        checkingOidc = false;
      }
    }, 450);
    return () => clearTimeout(timer);
  });

  function startOidc() {
    const params = new URLSearchParams({
      host: host.trim(),
      label: label.trim(),
      color
    });
    window.location.href = `/api/auth/oidc/start?${params.toString()}`;
  }

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
      <p class="text-xs text-slate-400">Renseignez l'adresse de votre serveur JMAP pour vous connecter.</p>
    </div>

    {#if error}
      <p class="rounded-lg bg-red-500/15 p-3 text-xs text-red-300">{error}</p>
    {/if}

    <div class="space-y-3">
      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Nom du compte</label>
        <div class="grid grid-cols-4 gap-2">
          <input bind:value={label} placeholder="Ex : Perso, Pro..." class="col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <input type="color" bind:value={color} title="Couleur du compte" class="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1" />
        </div>
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="block text-xs font-medium text-slate-300">Nom du serveur</label>
          {#if checkingOidc}
            <span class="text-[11px] text-slate-400">Vérification OIDC...</span>
          {:else if oidcSupported}
            <span class="rounded bg-[#48B17F]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#48B17F]">OIDC détecté</span>
          {/if}
        </div>
        <input bind:value={host} placeholder="https://mail.mondomaine.fr" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>

      {#if oidcSupported}
        <button type="button" onclick={startOidc} class="flex w-full items-center justify-center gap-2 rounded-lg bg-[#48B17F] py-2.5 text-sm font-semibold text-[#08101A] hover:opacity-90">
          <span>🔐</span>
          <span>Continuer avec OIDC (SSO)</span>
        </button>

        <div class="relative flex items-center py-1">
          <div class="flex-grow border-t border-slate-800"></div>
          <span class="mx-3 flex-shrink text-[11px] text-slate-500">ou avec un mot de passe d'application</span>
          <div class="flex-grow border-t border-slate-800"></div>
        </div>
      {/if}

      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Adresse mail</label>
        <input bind:value={username} type="email" placeholder="prenom@mondomaine.fr" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-slate-300">Mot de passe d'application</label>
        <input type="password" bind:value={password} placeholder="••••••••••••" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>
    </div>

    <button disabled={loading} class="w-full rounded-lg {oidcSupported ? 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-[#48B17F] font-semibold text-[#08101A] hover:opacity-90'} py-2.5 text-sm disabled:opacity-50">
      {loading ? 'Connexion en cours...' : 'Se connecter'}
    </button>
  </form>
</div>
