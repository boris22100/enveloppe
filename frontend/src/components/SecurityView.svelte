<script lang="ts">
  import type { Account } from '../lib/jmap/client';
  import {
    createAppPassword,
    deleteAppPassword,
    fetchAppPasswords, updateAccountPassword,
    type AppPassword
  } from '../lib/jmap/security';

  let { account, onLogout }: { account: Account; onLogout: () => void } = $props();

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let pwdMessage = $state('');
  let pwdError = $state('');

  let appPasswords = $state<AppPassword[]>([]);
  let newAppName = $state('');
  let generatedSecret = $state('');
  let appError = $state('');
  let loading = $state(false);

  async function loadAppPasswords() {
    appError = '';
    try {
      appPasswords = await fetchAppPasswords(account.id);
    } catch (err: any) {
      appError = err.message || 'Impossible de charger les mots de passe d’application.';
    }
  }

  $effect(() => {
    if (account?.id) loadAppPasswords();
  });

  async function changePassword(e: Event) {
    e.preventDefault();
    pwdMessage = "";
    pwdError = "";
    if (newPassword !== confirmPassword) {
      pwdError = "Les nouveaux mots de passe ne correspondent pas.";
      return;
    }
    try {
      await updateAccountPassword(account.id, currentPassword, newPassword);
      pwdMessage = "Mot de passe mis à jour. Déconnexion en cours...";
      currentPassword = newPassword = confirmPassword = "";
      setTimeout(() => onLogout(), 1200);
    } catch (err: any) {
      pwdError = err.message || "Impossible de modifier le mot de passe.";
    }
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    appError = '';
    generatedSecret = '';
    loading = true;
    try {
      generatedSecret = await createAppPassword(account.id, newAppName.trim());
      newAppName = '';
      await loadAppPasswords();
    } catch (err: any) {
      appError = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleDelete(keyId: string) {
    appError = '';
    try {
      await deleteAppPassword(account.id, keyId);
      await loadAppPasswords();
    } catch (err: any) {
      appError = err.message;
    }
  }
</script>

<div class="flex h-full flex-col space-y-6 overflow-y-auto p-6">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <h2 class="text-xl font-bold text-white">Sécurité — {account.label}</h2>
      <p class="text-xs text-slate-400">{account.username} ({account.host})</p>
    </div>
    <a
      href="{account.host}/account"
      target="_blank"
      rel="noreferrer"
      class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-[#48B17F] hover:text-white"
    >
      Ouvrir le portail Stalwart ↗
    </a>
  </div>

  <!-- Changement de mot de passe -->
  <section class="max-w-xl space-y-4 rounded-xl border border-slate-800 bg-[#0D1B2A] p-5">
    <h3 class="text-sm font-semibold text-white">Changer le mot de passe du compte</h3>
    {#if pwdMessage}<p class="rounded-lg bg-[#48B17F]/15 p-2.5 text-xs text-[#48B17F]">{pwdMessage}</p>{/if}
    {#if pwdError}<p class="rounded-lg bg-red-500/15 p-2.5 text-xs text-red-300">{pwdError}</p>{/if}
    <form onsubmit={changePassword} class="space-y-3">
      <input type="password" bind:value={currentPassword} placeholder="Mot de passe actuel" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      <input type="password" bind:value={newPassword} placeholder="Nouveau mot de passe" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      <input type="password" bind:value={confirmPassword} placeholder="Confirmer le nouveau mot de passe" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      <button class="rounded-lg bg-[#48B17F] px-4 py-2 text-sm font-semibold text-[#08101A]">Mettre à jour</button>
    </form>
  </section>

  <!-- Mots de passe d'application (JMAP natif urn:stalwart:jmap) -->
  <section class="max-w-xl space-y-4 rounded-xl border border-slate-800 bg-[#0D1B2A] p-5">
    <h3 class="text-sm font-semibold text-white">Mots de passe d'application</h3>

    {#if appError}
      <p class="rounded-lg bg-red-500/15 p-2.5 text-xs text-red-300">{appError}</p>
    {/if}

    {#if generatedSecret}
      <div class="rounded-lg border border-[#48B17F] bg-[#0D3A4D]/60 p-3 text-xs text-white">
        <p class="mb-1 text-slate-300">Copie ce mot de passe maintenant (il ne sera plus affiché) :</p>
        <code class="block select-all break-all rounded bg-slate-950 px-2 py-1.5 font-mono text-sm text-[#48B17F]">{generatedSecret}</code>
      </div>
    {/if}

    <form onsubmit={handleCreate} class="flex gap-2">
      <input
        bind:value={newAppName}
        placeholder="Description (ex: Pixel 11, Thunderbird)"
        required
        class="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
      />
      <button disabled={loading} class="rounded-lg bg-[#48B17F] px-4 py-2 text-sm font-semibold text-[#08101A] disabled:opacity-50">
        {loading ? '...' : 'Ajouter'}
      </button>
    </form>

    <div class="divide-y divide-slate-800">
      {#each appPasswords as item}
        <div class="flex items-center justify-between py-2.5">
          <div>
            <p class="text-sm font-medium text-white">{item.description || item.id}</p>
            {#if item.expiresAt}
              <p class="text-xs text-slate-500">Expire le {item.expiresAt}</p>
            {/if}
          </div>
          <button
            onclick={() => handleDelete(item.id)}
            class="rounded-lg bg-red-500/15 px-3 py-1 text-xs text-red-300 hover:bg-red-500/25"
          >
            Supprimer
          </button>
        </div>
      {:else}
        <p class="py-2 text-xs text-slate-500">Aucun mot de passe d'application configuré.</p>
      {/each}
    </div>
  </section>
</div>
