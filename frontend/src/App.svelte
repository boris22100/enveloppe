<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { db, type CachedEmail } from './lib/db/cache';
  import {
    archiveEmail, createMailbox, deleteMailbox, destroyEmail, emptyMailboxes, fetchEmailBody, fetchMailboxes, fetchMailboxEmails, fetchQuota, getMailboxSubtreeIds, getPrimaryAccountId, markMailboxesAsRead, renameMailbox, ROLE_META, setEmailKeyword, updateEmailMailbox,
    sendEmail, uploadAttachment, type Account, type Attachment, type DiskQuota, type Mailbox
  } from './lib/jmap/client';
  import { enableWebPush } from './lib/jmap/push';
  import LoginPage from './components/LoginPage.svelte';
  import AccountModal from './components/AccountModal.svelte';
  import MailReader from './components/MailReader.svelte';
  import SenderAvatar from './components/SenderAvatar.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import ConfirmModal from './components/ConfirmModal.svelte';
  import ContactsView from './components/ContactsView.svelte';
  import CalendarView from './components/CalendarView.svelte';
  import SieveView from './components/SieveView.svelte';
  import SecurityView from './components/SecurityView.svelte';

  let accounts = $state<Account[]>([]);
  let loaded = $state(false);
  let activeAccountId = $state<string | null>(null);
  const savedTab = typeof localStorage !== 'undefined' ? localStorage.getItem('enveloppe_tab') : null;
  let activeTab = $state<'mail' | 'contacts' | 'calendar' | 'sieve' | 'security'>(
    (savedTab === 'mail' || savedTab === 'contacts' || savedTab === 'calendar' || savedTab === 'sieve' || savedTab === 'security') ? savedTab : 'mail'
  );
  let sievePrefill = $state<{ from?: string; subject?: string } | null>(null);
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
  let statusToast = $state('');
  let batchBusy = $state(false);
  let sse: EventSource | null = null;

  let confirmDialog = $state<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  let activeAccount = $derived(accounts.find((a) => a.id === activeAccountId) ?? null);
  let activeMailbox = $derived(mailboxes.find((m) => m.id === activeMailboxId) ?? null);

  function showToast(msg: string) {
    statusToast = msg;
    setTimeout(() => {
      if (statusToast === msg) statusToast = '';
    }, 4500);
  }

  function folderDisplayName(box: Mailbox | null): string {
    if (!box) return 'Messages';
    return (box.role && ROLE_META[box.role]?.label) || box.name;
  }

  $effect(() => {
    localStorage.setItem('enveloppe_tab', activeTab);
    if (activeAccountId) localStorage.setItem('enveloppe_account', activeAccountId);
    if (activeMailboxId) localStorage.setItem('enveloppe_mailbox', activeMailboxId);
  });

  async function loadAccounts() {
    const res = await fetch('/api/accounts');
    accounts = await res.json();
    loaded = true;
    if (accounts.length && !activeAccountId) {
      const savedAcc = localStorage.getItem('enveloppe_account');
      const target = accounts.find((a) => a.id === savedAcc) ?? accounts[0];
      selectAccount(target.id);
    }
  }

  function connectRealtime(id: string) {
    sse?.close();
    sse = new EventSource(`/api/jmap/${id}/events`);
    sse.addEventListener('state', async () => {
      if (activeAccountId === id && activeTab === 'mail' && activeMailboxId) {
        mailboxes = await fetchMailboxes(id);
        await loadFolderEmails(id, activeMailboxId);
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
    const savedBox = localStorage.getItem('enveloppe_mailbox');
    const targetBox = mailboxes.find((m) => m.id === savedBox) ?? mailboxes.find((m) => m.role === 'inbox') ?? mailboxes[0];
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
      blobId: e.blobId,
      subject: e.subject,
      from: e.from ?? [],
      receivedAt: e.receivedAt,
      preview: e.preview,
      keywords: e.keywords ?? {},
      isUnread: !e.keywords?.['$seen']
    }));
  }

  async function openEmail(mail: CachedEmail) {
    const wasUnread = mail.isUnread;
    selectedEmail = mail;
    mail.isUnread = false;
    if (mail.keywords) mail.keywords['$seen'] = true;
    activeBody = await fetchEmailBody(mail.accountId, mail.id);
    if (wasUnread && activeAccountId) {
      mailboxes = await fetchMailboxes(activeAccountId);
    }
  }

  async function handleArchive(mail: CachedEmail) {
    if (!activeMailboxId || !activeAccountId) return;
    const archiveBox = mailboxes.find((m) => m.role === 'archive');
    emails = emails.filter((e) => e.id !== mail.id);
    if (selectedEmail?.id === mail.id) { selectedEmail = null; activeBody = null; }
    await archiveEmail(mail.accountId, mail.id, activeMailboxId, archiveBox?.id);
    mailboxes = await fetchMailboxes(activeAccountId);
  }

  function requestDeleteMail(mail: CachedEmail) {
    if (!activeAccountId) return;
    const accId = activeAccountId;
    const trash = mailboxes.find((b) => b.role === 'trash');
    const permanent = !trash || activeMailboxId === trash.id;
    const label = mail.subject || '(Sans objet)';

    confirmDialog = {
      title: permanent ? 'Supprimer définitivement le message' : 'Déplacer vers la corbeille',
      message: permanent
        ? `Voulez-vous vraiment supprimer définitivement « ${label} » ? Cette action est irréversible.`
        : `Voulez-vous vraiment déplacer « ${label} » dans la corbeille ?`,
      confirmLabel: permanent ? 'Supprimer définitivement' : 'Mettre à la corbeille',
      onConfirm: async () => {
        if (permanent) await destroyEmail(accId, mail.id);
        else await updateEmailMailbox(accId, mail.id, trash!.id);
        confirmDialog = null;
        if (selectedEmail?.id === mail.id) { selectedEmail = null; activeBody = null; }
        mailboxes = await fetchMailboxes(accId);
        quota = await fetchQuota(accId);
        if (activeMailboxId) await loadFolderEmails(accId, activeMailboxId);
      }
    };
  }

  async function handleMarkMailboxRead(box: Mailbox) {
    if (!activeAccountId || batchBusy) return;
    const accId = activeAccountId;
    batchBusy = true;
    try {
      const ids = getMailboxSubtreeIds(mailboxes, box.id);
      const count = await markMailboxesAsRead(accId, ids);
      mailboxes = await fetchMailboxes(accId);
      if (activeMailboxId && ids.includes(activeMailboxId)) {
        await loadFolderEmails(accId, activeMailboxId);
      }
      showToast(count > 0 ? `${count} message(s) marqué(s) comme lu(s) dans « ${folderDisplayName(box)} ».` : `Aucun message non lu dans « ${folderDisplayName(box)} ».`); } finally { batchBusy = false; } }  function requestEmptyMailbox(box: Mailbox) { if (!activeAccountId) return; const accId = activeAccountId; const isTrash = box.role === 'trash'; const isJunk = box.role === 'junk'; const ids = getMailboxSubtreeIds(mailboxes, box.id);  confirmDialog = { title: isTrash ? 'Vider la corbeille' : isJunk ? 'Supprimer les indésirables' : `Vider « ${box.name} »`,
      message: isTrash
        ? 'Voulez-vous vraiment supprimer définitivement tous les messages de la corbeille (et de ses sous-dossiers) ? Cette action est irréversible.'
        : isJunk
          ? 'Voulez-vous vraiment supprimer définitivement tous les messages indésirables ? Cette action est irréversible.'
          : `Voulez-vous vraiment supprimer définitivement tous les messages de « ${box.name} » ? Cette action est irréversible.`,
      confirmLabel: isTrash ? 'Vider la corbeille' : isJunk ? 'Supprimer les indésirables' : 'Supprimer tout',
      onConfirm: async () => {
        const count = await emptyMailboxes(accId, ids);
        confirmDialog = null;
        if (activeMailboxId && ids.includes(activeMailboxId)) {
          selectedEmail = null;
          activeBody = null;
          await loadFolderEmails(accId, activeMailboxId);
        }
        mailboxes = await fetchMailboxes(accId);
        quota = await fetchQuota(accId);
        showToast(count > 0 ? `${count} message(s) supprimé(s) définitivement.` : 'Ce dossier était déjà vide.');
      }
    };
  }

  function requestDeleteFolder(box: Mailbox) {
    if (!activeAccountId || box.role) return;
    const accId = activeAccountId;
    confirmDialog = {
      title: 'Supprimer le dossier',
      message: `Voulez-vous vraiment supprimer le dossier « ${box.name} » ?`,
      confirmLabel: 'Supprimer le dossier',
      onConfirm: async () => {
        await deleteMailbox(accId, box.id);
        confirmDialog = null;
        mailboxes = await fetchMailboxes(accId);
        if (activeMailboxId === box.id) {
          const fallback = mailboxes.find((m) => m.role === 'inbox') ?? mailboxes[0];
          if (fallback) await selectMailbox(fallback.id);
          else { activeMailboxId = null; emails = []; selectedEmail = null; activeBody = null; }
        }
        showToast(`Dossier « ${box.name} » supprimé.`); } }; }  async function handleLogout() { if (!activeAccountId) return; const idToRemove = activeAccountId; sse?.close(); await fetch(`/api/accounts/${idToRemove}`, { method: 'DELETE' });
    await db.emails.where('accountId').equals(idToRemove).delete();
    localStorage.removeItem('enveloppe_account');
    localStorage.removeItem('enveloppe_mailbox');
    localStorage.removeItem('enveloppe_tab');
    activeTab = 'mail';
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
      showToast(await enableWebPush(activeAccountId));
    } catch (err: any) {
      showToast(err.message);
    }
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
    showToast('Message envoyé.');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (confirmDialog || showComposer || showAccountModal) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'c') showComposer = true;
    if (e.key === 'e' && selectedEmail) handleArchive(selectedEmail);
    if (e.key === 'Delete' && selectedEmail) requestDeleteMail(selectedEmail);
  }

  onMount(loadAccounts);
  onDestroy(() => sse?.close());

  let ctxMenu = $state<{ x: number; y: number; type: 'mail' | 'mailbox'; mail?: CachedEmail; mailbox?: Mailbox } | null>(null);

  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  async function handleContextAction(action: string, payload?: any) {
    if (!activeAccountId || !ctxMenu) return;
    const accId = activeAccountId;
    if (ctxMenu.type === 'mail' && ctxMenu.mail) {
      const m = ctxMenu.mail;
      if (action === 'archive') {
        const arch = mailboxes.find((b) => b.role === 'archive');
        if (arch) await updateEmailMailbox(accId, m.id, arch.id);
      } else if (action === 'delete') {
        requestDeleteMail(m);
        return;
      } else if (action === 'spam') {
        const junk = mailboxes.find((b) => b.role === 'junk');
        if (junk) await updateEmailMailbox(accId, m.id, junk.id);
      } else if (action === 'move' && payload) {
        await updateEmailMailbox(accId, m.id, payload);
      } else if (action === 'toggleRead') {
        const currentlySeen = m.keywords ? !!m.keywords['$seen'] : !m.isUnread;
        await setEmailKeyword(accId, m.id, '$seen', !currentlySeen);
      } else if (action === 'toggleStar') {
        await setEmailKeyword(accId, m.id, '$flagged', !m.keywords?.['$flagged']);
      } else if (action === 'downloadEml' && m.blobId) {
        const jmapAccId = await getPrimaryAccountId(accId);
        window.open(`/api/jmap/${accId}/download/${encodeURIComponent(jmapAccId)}/${encodeURIComponent(m.blobId)}/${encodeURIComponent((m.subject || 'message') + '.eml')}?type=message%2Frfc822`, '_blank');
        return;
      } else if (action === 'print') {
        await openEmail(m);
        setTimeout(() => window.print(), 300);
        return;
      } else if (action === 'createFilter') {
        sievePrefill = { from: m.from?.[0]?.email || '', subject: m.subject || '' };
        activeTab = 'sieve';
        return;
      }
      mailboxes = await fetchMailboxes(accId);
      if (activeMailboxId) await loadFolderEmails(accId, activeMailboxId);
    } else if (ctxMenu.type === 'mailbox' && ctxMenu.mailbox) {
      const box = ctxMenu.mailbox;
      if (action === 'markRead') {
        await handleMarkMailboxRead(box);
      } else if (action === 'emptyJunk' || action === 'emptyTrash') {
        requestEmptyMailbox(box);
      } else if (action === 'newSubfolder') {
        const name = prompt(`Nom du sous-dossier dans « ${folderDisplayName(box)} » :`);
        if (name?.trim()) { await createMailbox(accId, name.trim(), box.id); mailboxes = await fetchMailboxes(accId); }
      } else if (action === 'renameFolder') {
        const name = prompt('Nouveau nom du dossier :', box.name);
        if (name?.trim()) { await renameMailbox(accId, box.id, name.trim()); mailboxes = await fetchMailboxes(accId); }
      } else if (action === 'deleteFolder') {
        requestDeleteFolder(box);
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if statusToast}
  <div class="fixed bottom-4 right-4 z-50 rounded-xl border border-[#48B17F]/40 bg-[#0D3A4D] px-4 py-2.5 text-xs text-white shadow-xl">
    {statusToast}
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
        <button onclick={() => (activeTab = 'sieve')} title="Filtres (Sieve)" class="flex items-center gap-3 rounded-xl {railExpanded ? 'w-full px-3 py-2 text-xs' : 'h-10 w-10 justify-center'} {activeTab === 'sieve' ? 'bg-[#0D3A4D] text-[#48B17F]' : 'text-slate-400 hover:text-white'}">
          <span>⚡</span>{#if railExpanded}<span>Filtres</span>{/if}
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
        <nav class="flex w-60 flex-col overflow-y-auto border-r border-slate-800/80 bg-[#0A131E] py-3">
          <div class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dossiers</div>
          {#each mailboxes as box}
            <div
              oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: 'mailbox', mailbox: box }; }}
              style="padding-left: {12 + (box.depth ?? 0) * 14}px"
              class="group flex items-center justify-between gap-1 pr-2 text-xs transition-colors hover:bg-slate-800/50 {activeMailboxId === box.id ? 'bg-[#0D3A4D]/70 font-semibold text-[#48B17F]' : 'text-slate-300'}"
            >
              <button
                type="button"
                onclick={() => selectMailbox(box.id)}
                class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
              >
                <span class="shrink-0">{box.depth ? '📁' : (box.role && ROLE_META[box.role]?.icon) || '📁'}</span>
                <span class="truncate">{folderDisplayName(box)}</span>
              </button>

              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Marquer comme lu(s)"
                  disabled={batchBusy}
                  onclick={(e) => { e.stopPropagation(); handleMarkMailboxRead(box); }}
                  class="rounded px-1 py-0.5 text-[11px] text-slate-400 opacity-0 transition-opacity hover:bg-slate-700/80 hover:text-[#48B17F] focus:opacity-100 group-hover:opacity-100"
                >
                  ✓
                </button>

                {#if box.role === 'trash'}
                  <button
                    type="button"
                    title="Vider la corbeille"
                    onclick={(e) => { e.stopPropagation(); requestEmptyMailbox(box); }}
                    class="rounded px-1 py-0.5 text-[11px] text-slate-400 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    🗑️
                  </button>
                {:else if box.role === 'junk'}
                  <button
                    type="button"
                    title="Supprimer les indésirables"
                    onclick={(e) => { e.stopPropagation(); requestEmptyMailbox(box); }}
                    class="rounded px-1 py-0.5 text-[11px] text-slate-400 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    🗑️
                  </button>
                {:else if !box.role}
                  <button
                    type="button"
                    title="Supprimer le dossier"
                    onclick={(e) => { e.stopPropagation(); requestDeleteFolder(box); }}
                    class="rounded px-1 py-0.5 text-[11px] text-slate-400 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    🗑️
                  </button>
                {/if}

                {#if box.unreadEmails > 0}
                  <span class="ml-0.5 rounded-full bg-[#48B17F]/20 px-1.5 py-0.5 text-[10px] text-[#48B17F]">{box.unreadEmails}</span>
                {/if}
              </div>
            </div>
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
          <div class="flex min-w-0 items-center gap-2">
            <button onclick={() => (showFolders = !showFolders)} title="Afficher/Masquer les dossiers" class="text-slate-400 hover:text-white">☰</button>
            <span class="truncate text-sm font-semibold text-slate-200">{folderDisplayName(activeMailbox)}</span>
          </div>
          <button onclick={() => (showComposer = true)} class="shrink-0 rounded-lg bg-[#48B17F] px-3 py-1 text-xs font-semibold text-[#0B1622]">Nouveau (C)</button>
        </div>

        {#if activeMailbox}
          <div class="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/80 bg-[#0A131E]/80 px-3 py-1.5 text-[11px]">
            <button
              type="button"
              disabled={batchBusy}
              onclick={() => handleMarkMailboxRead(activeMailbox!)}
              class="rounded-md border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-slate-300 hover:border-[#48B17F] hover:text-[#48B17F] disabled:opacity-50"
            >
              📭 Marquer comme lu(s)
            </button>

            {#if activeMailbox.role === 'trash'}
              <button
                type="button"
                onclick={() => requestEmptyMailbox(activeMailbox!)}
                class="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-medium text-red-300 hover:bg-red-500/20"
              >
                🔥 Vider la corbeille
              </button>
            {:else if activeMailbox.role === 'junk'}
              <button
                type="button"
                onclick={() => requestEmptyMailbox(activeMailbox!)}
                class="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-medium text-red-300 hover:bg-red-500/20"
              >
                🗑️ Supprimer les indésirables
              </button>
            {:else if !activeMailbox.role}
              <button
                type="button"
                onclick={() => requestDeleteFolder(activeMailbox!)}
                class="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-medium text-red-300 hover:bg-red-500/20"
              >
                🗑️ Supprimer le dossier
              </button>
            {/if}
          </div>
        {/if}

        <div class="flex-1 divide-y divide-slate-800/60 overflow-y-auto">
          {#each emails as mail}
            <button onclick={() => openEmail(mail)} oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: 'mail', mail }; }} class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 {selectedEmail?.id === mail.id ? 'bg-[#0D3A4D]/60' : ''}">
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
    {:else if activeTab === 'sieve' && activeAccountId}
      <main class="flex-1 bg-[#0B1622]"><SieveView accountId={activeAccountId} {mailboxes} prefill={sievePrefill} onPrefillConsumed={() => (sievePrefill = null)} /></main>
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

{#if confirmDialog}
  <ConfirmModal
    title={confirmDialog.title}
    message={confirmDialog.message}
    confirmLabel={confirmDialog.confirmLabel}
    onConfirm={confirmDialog.onConfirm}
    onCancel={() => (confirmDialog = null)}
  />
{/if}
