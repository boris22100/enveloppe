<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { db, type CachedEmail } from './lib/db/cache';
  import {
    archiveEmail, createMailbox, deleteMailbox, destroyEmail, fetchEmailBody, fetchMailboxes, fetchMailboxEmails, fetchQuota, renameMailbox, ROLE_META, setEmailKeyword, updateEmailMailbox,
    sendEmail, uploadAttachment, type Account, type Attachment, type DiskQuota, type Mailbox
  } from './lib/jmap/client';
  import { enableWebPush } from './lib/jmap/push';
  import LoginPage from './components/LoginPage.svelte';
  import AccountModal from './components/AccountModal.svelte';
  import MailReader from './components/MailReader.svelte';
  import SenderAvatar from './components/SenderAvatar.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import ContactsView from './components/ContactsView.svelte';
  import CalendarView from './components/CalendarView.svelte';
  import SecurityView from './components/SecurityView.svelte';

  let accounts = $state<Account[]>([]);
  let loaded = $state(false);
  let activeAccountId = $state<string | null>(null);
  const savedTab = typeof localStorage !== "undefined" ? localStorage.getItem("enveloppe_tab") : null;
  let activeTab = $state<'mail' | 'contacts' | 'calendar' | 'security'>(
    (savedTab === "mail" || savedTab === "contacts" || savedTab === "calendar" || savedTab === "security") ? savedTab : "mail"
  );
  let railExpanded = $state(false);

  let mailboxes = $state<Mailbox[]>([]);
  let activeMailboxId = $state<string | null>(null);
  let showFolders = $state(true);
  let quota = $state<DiskQuota | null>(null);

  let emails = $state<CachedEmail[]>([]);
  let selectedEmail = $state<CachedEmail | null>(null);
  let activeBody = $state<{ jmapAccountId: string; html: string | null; text: string; attachments: Attachment[] } | null>(null);

  let showAccountModal = $state(false);
  let showComposer = $state(false);
  let composeTo = $state('');
  let composeSubject = $state('');
  let composeText = $state('');
  let composeFiles = $state<Attachment[]>([]);
  let uploading = $state(false);
  let pushStatus = $state('');
  let sse: EventSource | null = null;

  let activeAccount = $derived(accounts.find((a) => a.id === activeAccountId) ?? null);

  $effect(() => {
    localStorage.setItem("enveloppe_tab", activeTab);
    if (activeAccountId) localStorage.setItem("enveloppe_account", activeAccountId);
    if (activeMailboxId) localStorage.setItem("enveloppe_mailbox", activeMailboxId);
  });

  async function loadAccounts() {
    const res = await fetch('/api/accounts');
    accounts = await res.json();
    loaded = true;
    if (accounts.length && !activeAccountId) {
      const savedAcc = localStorage.getItem("enveloppe_account");
      const target = accounts.find((a) => a.id === savedAcc) ?? accounts[0];
      selectAccount(target.id);
    }
  }

  function connectRealtime(id: string) {
    sse?.close();
    sse = new EventSource(`/api/jmap/${id}/events`);
    sse.addEventListener('state', () => {
      if (activeAccountId === id && activeTab === 'mail' && activeMailboxId) {
        loadFolderEmails(id, activeMailboxId);
      }
    });
  }

  async function selectAccount(id: string) {
    activeAccountId = id;
    selectedEmail = null;
    activeBody = null;
    connectRealtime(id);
    mailboxes = await fetchMailboxes(id);
    quota = await fetchQuota(id);
    const savedBox = localStorage.getItem("enveloppe_mailbox");
    const targetBox = mailboxes.find((m) => m.id === savedBox) ?? mailboxes.find((m) => m.role === "inbox") ?? mailboxes[0];
    if (targetBox) await selectMailbox(targetBox.id);
  }

  async function selectMailbox(mailboxId: string) {
    if (!activeAccountId) return;
    activeMailboxId = mailboxId;
    selectedEmail = null;
    activeBody = null;
    await loadFolderEmails(activeAccountId, mailboxId);
  }

  async function loadFolderEmails(accountId: string, mailboxId: string) {
    const list = await fetchMailboxEmails(accountId, mailboxId);
    emails = list.map((e) => ({
      uid: `${accountId}:${e.id}`,
      accountId,
      id: e.id,
      subject: e.subject,
      from: e.from ?? [],
      receivedAt: e.receivedAt,
      preview: e.preview,
      isUnread: !e.keywords?.['$seen']
    }));
  }

  async function openEmail(mail: CachedEmail) {
    selectedEmail = mail;
    mail.isUnread = false;
    activeBody = await fetchEmailBody(mail.accountId, mail.id);
  }

  async function handleArchive(mail: CachedEmail) {
    if (!activeMailboxId) return;
    const archiveBox = mailboxes.find((m) => m.role === 'archive');
    emails = emails.filter((e) => e.id !== mail.id);
    if (selectedEmail?.id === mail.id) { selectedEmail = null; activeBody = null; }
    await archiveEmail(mail.accountId, mail.id, activeMailboxId, archiveBox?.id);
  }

  async function handleLogout() {
    if (!activeAccountId) return;
    const idToRemove = activeAccountId;
    sse?.close();
    await fetch(`/api/accounts/${idToRemove}`, { method: 'DELETE' });
    await db.emails.where('accountId').equals(idToRemove).delete();
    localStorage.removeItem("enveloppe_account");
    localStorage.removeItem("enveloppe_mailbox");
    localStorage.removeItem("enveloppe_tab");
    activeTab = "mail";
    activeAccountId = null;
    selectedEmail = null;
    activeBody = null;
    mailboxes = [];
    emails = [];
    await loadAccounts();
  }

  async function handleEnablePush() {
    if (!activeAccountId) return;
    try {
      pushStatus = await enableWebPush(activeAccountId);
    } catch (err: any) {
      pushStatus = err.message;
    }
    setTimeout(() => (pushStatus = ''), 5000);
  }

  async function handleFileUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || !activeAccountId) return;
    uploading = true;
    try {
      for (const f of Array.from(files)) {
        composeFiles = [...composeFiles, await uploadAttachment(activeAccountId, f)];
      }
    } finally { uploading = false; }
  }

  async function handleSend(e: Event) {
    e.preventDefault();
    if (!activeAccountId) return;
    await sendEmail(activeAccountId, composeTo, composeSubject, composeText, composeFiles);
    composeTo = composeSubject = composeText = '';
    composeFiles = [];
    showComposer = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'c') showComposer = true;
    if (e.key === 'e' && selectedEmail) handleArchive(selectedEmail);
  }

  onMount(loadAccounts);
  onDestroy(() => sse?.close());
</script>

<svelte:window onkeydown={handleKeydown} />

{#if pushStatus}
  <div class="fixed bottom-4 right-4 z-50 rounded-xl border border-[#48B17F]/40 bg-[#0D3A4D] px-4 py-2.5 text-xs text-white shadow-xl">
    {pushStatus}
  </div>
{/if}

{#if !loaded}
  <div class="flex h-screen items-center justify-center bg-[#08101A] text-slate-400">Chargement...</div>
{:else if accounts.length === 0}
  <LoginPage onLoggedIn={loadAccounts} />
{:else}
  <div class="flex h-screen w-screen overflow-hidden">
    <!-- Rail gauche extensible / rétractable -->
    <aside class="flex flex-col justify-between border-r border-slate-800/80 bg-[#08101A] py-3 transition-all duration-200 {railExpanded ? 'w-52 px-3' : 'w-16 items-center'}">
      <div class="flex flex-col gap-2 {railExpanded ? 'w-full' : 'items-center'}">
        <button
          onclick={() => (railExpanded = !railExpanded)}
          title={railExpanded ? 'Rétracter le menu' : 'Agrandir le menu'}
          class="mb-2 flex h-9 items-center justify-center rounded-xl border border-slate-800 text-xs text-slate-400 hover:border-[#48B17F] hover:text-white {railExpanded ? 'w-full justify-between px-3' : 'w-10'}"
        >
          {#if railExpanded}<span class="font-bold text-white">Enveloppe</span>{/if}
          <span>{railExpanded ? '«' : '»'}</span>
        </button>

        {#each accounts as acc}
          <button
            onclick={() => selectAccount(acc.id)}
            title="{acc.label} ({acc.host})"
            class="flex items-center gap-3 rounded-xl transition-all {railExpanded ? 'w-full px-2 py-1.5 text-left' : 'h-10 w-10 justify-center'} {activeAccountId === acc.id ? 'bg-slate-800/70 ring-1 ring-[#48B17F]' : 'opacity-70 hover:opacity-100'}"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style="background-color: {acc.color}; color: #08101A;">
              {acc.label.slice(0, 2).toUpperCase()}
            </span>
            {#if railExpanded}
              <span class="truncate text-xs font-medium text-white">{acc.label}</span>
            {/if}
          </button>
        {/each}

        <button
          onclick={() => (showAccountModal = true)}
          title="Ajouter un serveur"
          class="flex items-center gap-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:border-[#48B17F] hover:text-[#48B17F] {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'}"
        >
          <span>+</span>
          {#if railExpanded}<span>Ajouter un compte</span>{/if}
        </button>
      </div>

      <div class="flex flex-col gap-1.5 {railExpanded ? 'w-full' : 'items-center'}">
        <button onclick={() => (activeTab = 'mail')} title="Messagerie" class="flex items-center gap-3 rounded-xl {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'} {activeTab === 'mail' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          <span>✉️</span>{#if railExpanded}<span>Messagerie</span>{/if}
        </button>
        <button onclick={() => (activeTab = 'contacts')} title="Contacts" class="flex items-center gap-3 rounded-xl {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'} {activeTab === 'contacts' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          <span>👤</span>{#if railExpanded}<span>Contacts</span>{/if}
        </button>
        <button onclick={() => (activeTab = 'calendar')} title="Calendrier" class="flex items-center gap-3 rounded-xl {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'} {activeTab === 'calendar' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          <span>📅</span>{#if railExpanded}<span>Calendrier</span>{/if}
        </button>
        <button onclick={() => (activeTab = 'security')} title="Sécurité" class="flex items-center gap-3 rounded-xl {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'} {activeTab === 'security' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          <span>🛡️</span>{#if railExpanded}<span>Sécurité</span>{/if}
        </button>
        <button onclick={handleEnablePush} title="Activer les notifications" class="flex items-center gap-3 rounded-xl text-slate-400 hover:text-[#48B17F] {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'}">
          <span>🔔</span>{#if railExpanded}<span>Notifications</span>{/if}
        </button>
        <button onclick={handleLogout} title="Déconnecter ce compte" class="flex items-center gap-3 rounded-xl text-slate-400 hover:bg-red-500/15 hover:text-red-400 {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'}">
          <span>🚪</span>{#if railExpanded}<span>Déconnexion</span>{/if}
        </button>
      </div>
    </aside>

    {#if activeTab === 'mail'}
      {#if showFolders}
        <nav class="flex w-56 flex-col overflow-y-auto border-r border-slate-800/80 bg-[#0A131E] py-3">
          <div class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dossiers</div>
          {#each mailboxes as box}
            <button
              onclick={() => selectMailbox(box.id)}
              oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: "mailbox", mailbox: box }; }}
              style="padding-left: {12 + (box.depth ?? 0) * 14}px"
              class="flex items-center justify-between py-1.5 pr-3 text-left text-xs transition-colors hover:bg-slate-800/50 {activeMailboxId === box.id ? 'bg-[#0D3A4D]/70 font-semibold text-[#48B17F]' : 'text-slate-300'}"
            >
              <span class="flex items-center gap-2 truncate"><span>{box.depth ? '📁' : (box.role && ROLE_META[box.role]?.icon) || '📁'}</span><span class="truncate">{(box.role && ROLE_META[box.role]?.label) || box.name}</span></span>
              {#if box.unreadEmails > 0}
                <span class="ml-2 rounded-full bg-[#48B17F]/20 px-1.5 py-0.5 text-[10px] text-[#48B17F]">{box.unreadEmails}</span>
              {/if}
            </button>
          {/each}
          {#if quota}
            <div class="mt-auto border-t border-slate-800/80 p-3">
              <div class="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>Stockage</span>
                <span class="font-semibold text-white">{quota.percent} %</span>
              </div>
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div class="h-full rounded-full transition-all {quota.percent > 85 ? 'bg-red-500' : 'bg-[#48B17F]'}" style="width: {quota.percent}%"></div>
              </div>
              <p class="mt-1 text-[10px] text-slate-500">{(quota.used / 1048576).toFixed(1)} Mo / {(quota.limit / 1073741824).toFixed(1)} Go</p>
            </div>
          {/if}
        </nav>
      {/if}

      <section class="flex w-96 flex-col border-r border-slate-800/80 bg-[#0B1622]">
        <div class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div class="flex items-center gap-2">
            <button onclick={() => (showFolders = !showFolders)} title="Afficher/Masquer les dossiers" class="text-slate-400 hover:text-white">☰</button>
            <span class="truncate text-sm font-semibold text-slate-200">
              {(() => { const b = mailboxes.find((m) => m.id === activeMailboxId); return (b?.role && ROLE_META[b.role]?.label) || b?.name || 'Messages'; })()}
            </span>
          </div>
          <button onclick={() => (showComposer = true)} class="rounded-lg bg-[#48B17F] px-3 py-1 text-xs font-semibold text-[#0B1622]">Nouveau (C)</button>
        </div>
        <div class="flex-1 divide-y divide-slate-800/60 overflow-y-auto">
          {#each emails as mail}
            <button onclick={() => openEmail(mail)} oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: "mail", mail }; }} class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 {selectedEmail?.id === mail.id ? 'bg-[#0D3A4D]/60' : ''}">
              <SenderAvatar name={mail.from[0]?.name} email={mail.from[0]?.email} />
              <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm {mail.isUnread ? 'font-bold text-white' : 'text-slate-300'}">{mail.from[0]?.name || mail.from[0]?.email || 'Inconnu'}</span>
                <span class="shrink-0 text-[11px] text-slate-500">{new Date(mail.receivedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
              </div>
              <p class="truncate text-xs {mail.isUnread ? 'text-slate-200' : 'text-slate-400'}">{mail.subject || '(Sans objet)'}</p>
              <p class="truncate text-xs text-slate-500">{mail.preview}</p>
              </div>
            </button>
          {:else}
            <div class="p-8 text-center text-xs text-slate-500">Aucun message dans ce dossier.</div>
          {/each}
        </div>
      </section>

      <main class="flex-1">
        {#if selectedEmail && activeBody && activeAccountId}
          <MailReader
            accountId={activeAccountId}
            jmapAccountId={activeBody.jmapAccountId}
            subject={selectedEmail.subject}
            from={selectedEmail.from.map((f) => f.name ? `${f.name} <${f.email}>` : f.email).join(', ')}
            html={activeBody.html}
            text={activeBody.text}
            attachments={activeBody.attachments}
            onArchive={() => handleArchive(selectedEmail!)}
          />
        {:else}
          <div class="flex h-full items-center justify-center text-sm text-slate-600">Sélectionne un message</div>
        {/if}
      </main>
    {:else if activeTab === 'contacts' && activeAccountId}
      <main class="flex-1 bg-[#0B1622]"><ContactsView accountId={activeAccountId} /></main>
    {:else if activeTab === 'calendar' && activeAccountId}
      <main class="flex-1 bg-[#0B1622]"><CalendarView accountId={activeAccountId} /></main>
    {:else if activeTab === 'security' && activeAccount}
      <main class="flex-1 bg-[#0B1622]"><SecurityView account={activeAccount} onLogout={handleLogout} /></main>
    {/if}
  </div>
{/if}

{#if showAccountModal}
  <AccountModal onAdded={loadAccounts} onClose={() => (showAccountModal = false)} />
{/if}

{#if showComposer}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <form onsubmit={handleSend} class="w-full max-w-lg space-y-3 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-6">
      <h3 class="text-base font-semibold text-white">Nouveau message</h3>
      <input bind:value={composeTo} type="email" placeholder="Destinataire" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      <input bind:value={composeSubject} placeholder="Objet" required class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      <textarea bind:value={composeText} rows="7" placeholder="Message..." required class="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white"></textarea>
      <div class="flex items-center justify-between">
        <label class="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-[#48B17F]">
          {uploading ? 'Upload...' : '📎 Joindre un fichier'}
          <input type="file" multiple onchange={handleFileUpload} class="hidden" />
        </label>
        <div class="flex gap-2">
          <button type="button" onclick={() => (showComposer = false)} class="px-4 py-2 text-sm text-slate-400">Annuler</button>
          <button disabled={uploading} class="rounded-lg bg-[#48B17F] px-4 py-2 text-sm font-semibold text-[#0B1622]">Envoyer</button>
        </div>
      </div>
      {#if composeFiles.length}
        <div class="flex flex-wrap gap-1.5 pt-1">
          {#each composeFiles as f}
            <span class="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{f.name}</span>
          {/each}
        </div>
      {/if}
    </form>
  </div>
{/if}

{#if ctxMenu}
  <ContextMenu
    x={ctxMenu.x}
    y={ctxMenu.y}
    type={ctxMenu.type}
    mail={ctxMenu.mail}
    mailbox={ctxMenu.mailbox}
    {mailboxes}
    onClose={() => (ctxMenu = null)}
    onAction={handleContextAction}
  />
{/if}
