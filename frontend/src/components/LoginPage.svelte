<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  let legalModal = $state<'legal' | 'privacy' | null>(null);

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
  let appVersion = $state('0.8.3');
  $effect(() => {
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.version) appVersion = String(d.version).replace(/^v/, '');
      })
      .catch(() => {});
  });
</script>

<div class="env-app flex min-h-screen flex-col items-center justify-between p-5">
  <main class="flex w-full flex-1 items-center justify-center">
    <form onsubmit={submit} class="env-card w-full max-w-md space-y-5 rounded-xl border p-8 shadow-2xl">
    <div class="space-y-1.5">
      <img src="/pwa-192.png" alt="Enveloppe JMAP" class="h-12 w-12 rounded-xl object-cover shadow-sm" />
      <div class="flex flex-wrap items-center gap-2.5">
        <h1 class="env-text text-2xl font-bold">Enveloppe JMAP</h1>
        <span class="env-accent-soft env-accent-text rounded-full border border-[#48B17F]/35 px-2.5 py-0.5 font-mono text-xs font-medium">
          v{appVersion}
        </span>
      </div>
      <p class="env-muted text-sm">{t('account.loginPrompt', undefined, activeLocale)}</p>
    </div>

    {#if error}
      <p role="alert" class="rounded-lg bg-red-500/15 p-3.5 text-xs font-medium text-red-400">{error}</p>
    {/if}

    <div class="space-y-3.5">
      <div>
        <label for="login-label" class="env-muted mb-1.5 block text-xs font-semibold">Nom du compte</label>
        <div class="grid grid-cols-5 gap-2.5">
          <input id="login-label" bind:value={label} placeholder="Ex : Perso, Pro..." class="env-input col-span-4 rounded-xl border px-3.5 py-2.5 text-sm" />
          <input type="color" bind:value={color} aria-label={t('account.accountColor', undefined, activeLocale)} title={t('account.accountColor', undefined, activeLocale)} class="env-input h-11 w-full cursor-pointer rounded-xl border p-1" />
        </div>
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label for="login-host" class="env-muted block text-xs font-semibold">Nom du serveur</label>
          {#if checkingOidc}
            <span class="env-faint text-xs">{t('account.checkingOidc', undefined, activeLocale)}</span>
          {:else if oidcSupported}
            <span class="env-accent-soft rounded-full px-2 py-0.5 text-xs font-semibold">{t('account.oidcDetected', undefined, activeLocale)}</span>
          {/if}
        </div>
        <input id="login-host" bind:value={host} placeholder="https://mail.mondomaine.fr" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
      </div>

      {#if oidcSupported}
        <button type="button" onclick={startOidc} class="env-accent-bg flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold shadow-sm hover:opacity-95">
          <span>🔐</span>
          <span>{t('account.continueOidc', undefined, activeLocale)}</span>
        </button>

        <div class="relative flex items-center py-1">
          <div class="env-border flex-grow border-t"></div>
          <span class="env-faint mx-3 flex-shrink text-xs">{t('account.orWithAppPassword', undefined, activeLocale)}</span>
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
      {loading ? t('account.signingIn', undefined, activeLocale) : 'Se connecter'}
    </button>
  </form>
  </main>

  <footer class="env-faint mt-6 flex flex-wrap items-center justify-center gap-3 pb-2 text-center text-xs">
    <span>{t('account.poweredBy', undefined, activeLocale)} <strong class="env-muted font-medium">BoWiz</strong></span>
    <span aria-hidden="true">·</span>
    <button
      type="button"
      onclick={() => (legalModal = 'legal')}
      class="hover:env-text underline underline-offset-4 transition-colors"
    >
      {t('account.legalNotice', undefined, activeLocale)}
    </button>
    <span aria-hidden="true">·</span>
    <button
      type="button"
      onclick={() => (legalModal = 'privacy')}
      class="hover:env-text underline underline-offset-4 transition-colors"
    >
      {t('account.privacyPolicy', undefined, activeLocale)}
    </button>
  </footer>

  {#if legalModal}
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      tabindex="-1"
      onclick={() => (legalModal = null)}
      onkeydown={(e) => e.key === 'Escape' && (legalModal = null)}
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
    >
      <div
        role="button"
        tabindex="0"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (legalModal = null)}
        class="env-card max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border p-6 shadow-2xl"
      >
        <div class="env-border mb-4 flex items-center justify-between border-b pb-3">
          <h2 id="legal-modal-title" class="env-text text-base font-bold">
            {legalModal === 'legal' ? t('account.legalNotice', undefined, activeLocale) : t('account.privacyPolicy', undefined, activeLocale)}
          </h2>
          <button
            type="button"
            onclick={() => (legalModal = null)}
            aria-label={t('common.close', undefined, activeLocale)}
            class="env-muted env-hover rounded-lg px-2.5 py-1 text-xs font-medium"
          >
            ✕ Fermer
          </button>
        </div>

        {#if legalModal === 'legal'}
          <div class="space-y-3.5 text-xs leading-relaxed env-muted">
            <p>
              <strong class="env-text">Éditeur du logiciel :</strong> Enveloppe est un client webmail JMAP open-source maintenu par <strong class="env-text">Boris Mallach</strong> (identifiant GitHub : <code class="env-text">boris22100</code>, dépôt : <code class="env-text">https://github.com/boris22100/enveloppe</code>).
            </p>
            <p>
              <strong class="env-text">Hébergement et responsabilité d'instance :</strong> Enveloppe étant conçu pour être auto-hébergé, l'hébergement physique/cloud de cette instance, la disponibilité du service et la conformité réglementaire (notamment le RGPD) relèvent de l'opérateur qui déploie et administre ce service.
            </p>
            <p>
              <strong class="env-text">Contact :</strong> Pour toute question relative au code source ou signalement de sécurité, consultez le dépôt officiel <code class="env-text">github.com/boris22100/enveloppe</code>. Pour une demande liée à votre compte ou à vos données d'hébergement, contactez l'administrateur de cette instance.
            </p>
            <p>
              <strong class="env-text">Propriété intellectuelle :</strong> Le code source d'Enveloppe est distribué sous sa licence open-source associée ; les marques, noms de domaine et serveurs tiers (ex. serveurs JMAP ou fournisseurs OIDC) restent la propriété de leurs détenteurs respectifs.
            </p>
          </div>
        {:else}
          <div class="space-y-3.5 text-xs leading-relaxed env-muted">
            <p>
              <strong class="env-text">Principe de transparence et sobriété :</strong> Enveloppe n'intègre aucun traceur publicitaire, aucun outil d'analyse comportementale tiers et aucun cookie publicitaire.
            </p>
            <p>
              <strong class="env-text">Données traitées lors de la connexion :</strong> L'adresse du serveur JMAP, l'identifiant de connexion, les informations d'authentification (JMAP ou flux OIDC/PKCE) et les requêtes de messagerie transitent uniquement entre votre navigateur, le backend Enveloppe de cette instance et le serveur JMAP / fournisseur d'identité configuré.
            </p>
            <p>
              <strong class="env-text">Stockage local et session :</strong>
            </p>
            <ul class="list-disc space-y-1.5 pl-5">
              <li><strong class="env-text">Sur votre navigateur :</strong> vos préférences d'interface (thème, onglet actif, options d'affichage, signatures configurées par compte) et, le cas échéant, le cache local sont stockés dans le stockage local de votre navigateur (<code class="env-text">localStorage</code> / <code class="env-text">IndexedDB</code>).</li>
              <li><strong class="env-text">Session :</strong> les informations de session sont chiffrées et gérées via des cookies <code class="env-text">HttpOnly</code> nécessaires au fonctionnement de l'authentification.</li>
            </ul>
            <p>
              <strong class="env-text">Conservation et droits :</strong> Vous pouvez effacer les données locales à tout moment en vous déconnectant ou en vidant les données du site dans votre navigateur. Pour toute demande d'accès, de rectification ou de suppression concernant des données conservées côté serveur/messagerie, adressez-vous directement à l'administrateur de l'instance ou de votre serveur mail.
            </p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

</div>
