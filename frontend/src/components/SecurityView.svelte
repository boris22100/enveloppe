<script lang="ts">
  import { errorMessage } from '../lib/errorMessage';
  import type { Account } from '../lib/jmap/client';
  import { getAccountSignature, setAccountSignature } from '../lib/signatures';
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
  let signature = $state('');
  let sigSaved = $state(false);

  async function loadAppPasswords() {
    appError = '';
    try {
      appPasswords = await fetchAppPasswords(account.id);
    } catch (err: unknown) {
      appError = errorMessage(err) || 'Impossible de charger les mots de passe d’application.';
    }
  }

  $effect(() => {
    if (account?.id) {
      loadAppPasswords();
      signature = getAccountSignature(account.id);
    }
  });

  function saveSignature(e: Event) {
    e.preventDefault();
    setAccountSignature(account.id, signature);
    sigSaved = true;
    setTimeout(() => (sigSaved = false), 3000);
  }

  async function changePassword(e: Event) {
    e.preventDefault();
    pwdMessage = '';
    pwdError = '';
    if (newPassword !== confirmPassword) {
      pwdError = 'Les nouveaux mots de passe ne correspondent pas.';
      return;
    }
    try {
      await updateAccountPassword(account.id, currentPassword, newPassword);
      pwdMessage = 'Mot de passe mis à jour. Déconnexion en cours...';
      currentPassword = newPassword = confirmPassword = '';
      setTimeout(() => onLogout(), 1200);
    } catch (err: unknown) {
      pwdError = errorMessage(err) || 'Impossible de modifier le mot de passe.';
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
    } catch (err: unknown) {
      appError = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  async function handleDelete(keyId: string) {
    appError = '';
    try {
      await deleteAppPassword(account.id, keyId);
      await loadAppPasswords();
    } catch (err: unknown) {
      appError = errorMessage(err);
    }
  }
</script>

<div class="flex h-full flex-col space-y-6 overflow-y-auto p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="env-text text-xl font-bold">Sécurité — {account.label}</h2>
      <p class="env-muted text-sm">{account.username} ({account.host})</p>
    </div>
    <a
      href="{account.host}/account"
      target="_blank"
      rel="noreferrer"
      class="env-input env-hover rounded-xl border px-4 py-2 text-xs font-medium"
    >
      Ouvrir le portail Stalwart ↗
    </a>
  </div>

  <section class="env-card max-w-xl space-y-4 rounded-xl border p-6 shadow-xs">
    <h3 class="env-text text-base font-semibold">Changer le mot de passe du compte</h3>
    {#if pwdMessage}<p role="status" class="env-accent-soft rounded-lg p-3 text-xs font-medium">{pwdMessage}</p>{/if}
    {#if pwdError}<p role="alert" class="rounded-lg bg-red-500/15 p-3 text-xs font-medium text-red-400">{pwdError}</p>{/if}
    <form onsubmit={changePassword} class="space-y-3">
      <input type="password" bind:value={currentPassword} aria-label="Mot de passe actuel" placeholder="Mot de passe actuel" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      <input type="password" bind:value={newPassword} aria-label="Nouveau mot de passe" placeholder="Nouveau mot de passe" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      <input type="password" bind:value={confirmPassword} aria-label="Confirmer le nouveau mot de passe" placeholder="Confirmer le nouveau mot de passe" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      <button class="env-accent-bg rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-95">Mettre à jour</button>
    </form>
  </section>

  <section class="env-card max-w-xl space-y-4 rounded-xl border p-6 shadow-xs">
    <h3 class="env-text text-base font-semibold">Mots de passe d'application</h3>

    {#if appError}
      <p role="alert" class="rounded-lg bg-red-500/15 p-3 text-xs font-medium text-red-400">{appError}</p>
    {/if}

    {#if generatedSecret}
      <div class="env-accent-soft rounded-lg border border-[#48B17F] p-4 text-xs">
        <p class="env-text mb-1.5 font-medium">Copie ce mot de passe maintenant (il ne sera plus affiché) :</p>
        <code class="env-card env-accent-text block select-all break-all rounded-xl border px-3 py-2 font-mono text-sm">{generatedSecret}</code>
      </div>
    {/if}

    <form onsubmit={handleCreate} class="flex gap-2.5">
      <input
        bind:value={newAppName}
        aria-label="Description du mot de passe d'application"
        placeholder="Description (ex: Pixel 11, Thunderbird)"
        required
        class="env-input flex-1 rounded-xl border px-3.5 py-2.5 text-sm"
      />
      <button disabled={loading} class="env-accent-bg rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
        {loading ? '...' : 'Ajouter'}
      </button>
    </form>

    <div class="env-divider divide-y">
      {#each appPasswords as item}
        <div class="flex items-center justify-between py-3">
          <div>
            <p class="env-text text-sm font-medium">{item.description || item.id}</p>
            {#if item.expiresAt}
              <p class="env-faint text-xs">Expire le {item.expiresAt}</p>
            {/if}
          </div>
          <button
            type="button"
            onclick={() => handleDelete(item.id)}
            class="rounded-xl bg-red-500/15 px-3.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25"
          >
            Supprimer
          </button>
        </div>
      {:else}
        <p class="env-faint py-2 text-xs">Aucun mot de passe d'application configuré.</p>
      {/each}
    </div>
  </section>

  <section class="env-card max-w-xl space-y-4 rounded-xl border p-6 shadow-xs">
    <h3 class="env-text text-base font-semibold">Signature de messagerie</h3>
    <p class="env-muted text-xs">Ajoutée automatiquement à la fin de vos nouveaux messages pour ce compte.</p>
    {#if sigSaved}
      <p role="status" class="env-accent-soft rounded-lg p-3 text-xs font-medium">Signature enregistrée pour ce compte.</p>
    {/if}
    <form onsubmit={saveSignature} class="space-y-3">
      <textarea
        bind:value={signature}
        rows="4"
        aria-label="Signature de messagerie"
        placeholder={'-- \nPrénom Nom — Fonction\nhttps://exemple.fr'}
        class="env-input w-full rounded-lg border p-3.5 text-sm"
      ></textarea>
      <button class="env-accent-bg rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-95">
        Enregistrer la signature
      </button>
    </form>
  </section>
</div>
