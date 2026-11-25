<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  let { onAdded, onClose }: { onAdded: () => void; onClose: () => void } = $props();

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
      onAdded();
      onClose();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !loading && onClose()} />

<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="acc-modal-title"
  tabindex="-1"
  onclick={() => !loading && onClose()}
  onkeydown={(e) => e.key === 'Escape' && !loading && onClose()}
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
>
  <div role="presentation" onclick={(e) => e.stopPropagation()} class="w-full max-w-md">
    <form onsubmit={submit} class="env-card space-y-4 rounded-xl border p-7 shadow-2xl">
      <h3 id="acc-modal-title" class="env-text text-lg font-semibold">{t('account.connectServer', undefined, activeLocale)}</h3>
      {#if error}
        <p role="alert" class="rounded-lg bg-red-500/15 p-3 text-xs font-medium text-red-400">{error}</p>
      {/if}
      <div class="grid grid-cols-5 gap-2.5">
        <input bind:value={label} aria-label={t('account.accountName', undefined, activeLocale)} placeholder="Nom (ex: Perso)" class="env-input col-span-4 rounded-xl border px-3.5 py-2.5 text-sm" />
        <input type="color" bind:value={color} aria-label={t('account.accountColor', undefined, activeLocale)} class="env-input h-11 w-full cursor-pointer rounded-xl border p-1" />
      </div>
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label for="acc-host" class="env-muted text-xs font-semibold">Serveur</label>
          {#if checkingOidc}
            <span class="env-faint text-xs">{t('account.checkingOidc', undefined, activeLocale)}</span>
          {:else if oidcSupported}
            <span class="env-accent-soft rounded-full px-2 py-0.5 text-xs font-semibold">{t('account.oidcDetected', undefined, activeLocale)}</span>
          {/if}
        </div>
        <input id="acc-host" bind:value={host} placeholder="https://mail.mondomaine.fr" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      </div>

      {#if oidcSupported}
        <button type="button" onclick={startOidc} class="env-accent-bg flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold hover:opacity-95">
          <span>🔐</span>
          <span>{t('account.continueOidc', undefined, activeLocale)}</span>
        </button>
        <div class="relative flex items-center py-1">
          <div class="env-border flex-grow border-t"></div>
          <span class="env-faint mx-3 flex-shrink text-xs">{t('account.orAppPassword', undefined, activeLocale)}</span>
          <div class="env-border flex-grow border-t"></div>
        </div>
      {/if}

      <input bind:value={username} aria-label="Identifiant ou adresse mail" placeholder="Identifiant / Email" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      <input type="password" bind:value={password} aria-label="Mot de passe d'application" placeholder="Mot de passe d'application" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick={onClose} class="env-muted env-hover rounded-xl px-4 py-2 text-sm">Annuler</button>
        <button disabled={loading} class="rounded-xl {oidcSupported ? 'env-input env-hover border font-medium' : 'env-accent-bg font-semibold'} px-4 py-2 text-sm disabled:opacity-50">
          {loading ? t('account.discoveringJmap', undefined, activeLocale) : 'Connecter'}
        </button>
      </div>
    </form>
  </div>
</div>
