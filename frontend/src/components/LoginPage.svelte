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
        const res = await fetch('/api/auth/oidc/discover?host=' + encodeURIComponent(clean));
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
    window.location.href = '/api/auth/oidc/start?' + params.toString();
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

<div class="env-app flex min-h-screen items-center justify-center p-5">
  <form onsubmit={submit} class="env-card w-full max-w-md space-y-5 rounded-3xl border p-8 shadow-2xl">
    <div class="space-y-1.5">
      <div aria-hidden="true" class="env-accent-soft inline-flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold">✉️</div>
      <h1 class="env-text text-2xl font-bold">Enveloppe</h1>
      <p class="env-muted text-sm">Renseignez l'adresse de votre serveur JMAP pour vous connecter.</p>
    </div>

    {#if error}
      <p role="alert" class="rounded-2xl bg-red-500/15 p-3.5 text-xs font-medium text-red-400">{error}</p>
    {/if}

    <div class="space-y-3.5">
      <div>
        <label for="login-label" class="env-muted mb-1.5 block text-xs font-semibold">Nom du compte</label>
        <div class="grid grid-cols-5 gap-2.5">
          <input id="login-label" bind:value={label} placeholder="Ex : Perso, Pro..." class="env-input col-span-4 rounded-xl border px-3.5 py-2.5 text-sm" />
          <input type="color" bind:value={color} aria-label="Couleur du compte" title="Couleur du compte" class="env-input h-11 w-full cursor-pointer rounded-xl border p-1" />
        </div>
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label for="login-host" class="env-muted block text-xs font-semibold">Nom du serveur</label>
          {#if checkingOidc}
            <span class="env-faint text-xs">Vérification OIDC...</span>
          {:else if oidcSupported}
            <span class="env-accent-soft rounded-full px-2 py-0.5 text-xs font-semibold">OIDC détecté</span>
          {/if}
        </div>
        <input id="login-host" bind:value={host} placeholder="https://mail.mondomaine.fr" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      </div>

      {#if oidcSupported}
        <button type="button" onclick={startOidc} class="env-accent-bg flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold shadow-sm hover:opacity-95">
          <span>🔐</span>
          <span>Continuer avec OIDC (SSO)</span>
        </button>

        <div class="relative flex items-center py-1">
          <div class="env-border flex-grow border-t"></div>
          <span class="env-faint mx-3 flex-shrink text-xs">ou avec un mot de passe d'application</span>
          <div class="env-border flex-grow border-t"></div>
        </div>
      {/if}

      <div>
        <label for="login-user" class="env-muted mb-1.5 block text-xs font-semibold">Adresse mail</label>
        <input id="login-user" bind:value={username} type="email" placeholder="prenom@mondomaine.fr" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      </div>

      <div>
        <label for="login-pass" class="env-muted mb-1.5 block text-xs font-semibold">Mot de passe d'application</label>
        <input id="login-pass" type="password" bind:value={password} placeholder="••••••••••••" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      </div>
    </div>

    <button disabled={loading} class="w-full rounded-xl {oidcSupported ? 'env-input env-hover border font-medium' : 'env-accent-bg font-semibold'} py-3 text-sm disabled:opacity-50">
      {loading ? 'Connexion en cours...' : 'Se connecter'}
    </button>
  </form>
</div>
