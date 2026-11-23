<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { db, type CachedEmail } from './lib/db/cache';
  import {
    archiveEmail, createMailbox, deleteMailbox, destroyEmail, emptyMailboxes, fetchEmailBody, fetchMailboxes, fetchMailboxEmails, fetchQuota, getMailboxSubtreeIds, getPrimaryAccountId, markMailboxesAsRead, renameMailbox, ROLE_META, setEmailKeyword, updateEmailMailbox,
    sendEmail, uploadAttachment, type Account, type Attachment, type DiskQuota, type Mailbox
  } from './lib/jmap/client';
  import { enableWebPush } from './lib/jmap/push';
  import { applyTheme, getSavedTheme, type ThemeMode } from './lib/theme';
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

  let themeMode = $state<ThemeMode>(getSavedTheme());
  $effect(() => {
    applyTheme(themeMode);
  });

  function cycleTheme() {
    themeMode = themeMode === 'abysses' ? 'dark' : themeMode === 'dark' ? 'light' : 'abysses';
  }

  let themeLabel = $derived(
    themeMode === 'abysses' ? 'Thème : Abysses' : themeMode === 'dark' ? 'Thème : Sombre' : 'Thème : Clair'
  );
  let themeIcon = $derived(
    themeMode === 'abysses' ? '🌊' : themeMode === 'dark' ? '🌙' : '☀️'
  );

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
    sse = new EventSource('/api/jmap/' + id + '/events');
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
      uid: accountId + ':' + e.id,
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
        ? 'Voulez-vous vraiment supprimer définitivement « ' + label + ' » ? Cette action est irréversible.'
        : 'Voulez-vous vraiment déplacer « ' + label + ' » dans la corbeille ?',
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
      showToast(count > 0 ? count + ' message(s) marqué(s) comme lu(s) dans « ' + folderDisplayName(box) + ' ».' : 'Aucun message non lu dans « ' + folderDisplayName(box) + ' ».');
    } finally {
      batchBusy = false;
    }
  }

  function requestEmptyMailbox(box: Mailbox) {
    if (!activeAccountId) return;
    const accId = activeAccountId;
    const isTrash = box.role === 'trash';
    const isJunk = box.role === 'junk';
    const ids = getMailboxSubtreeIds(mailboxes, box.id);

    confirmDialog = {
      title: isTrash ? 'Vider la corbeille' : isJunk ? 'Supprimer les indésirables' : 'Vider « ' + box.name + ' »',
      message: isTrash
        ? 'Voulez-vous vraiment supprimer définitivement tous les messages de la corbeille (et de ses sous-dossiers) ? Cette action est irréversible.'
        : isJunk
          ? 'Voulez-vous vraiment supprimer définitivement tous les messages indésirables ? Cette action est irréversible.'
          : 'Voulez-vous vraiment supprimer définitivement tous les messages de « ' + box.name + ' » ? Cette action est irréversible.',
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
        showToast(count > 0 ? count + ' message(s) supprimé(s) définitivement.' : 'Ce dossier était déjà vide.');
      }
    };
  }

  function requestDeleteFolder(box: Mailbox) {
    if (!activeAccountId || box.role) return;
    const accId = activeAccountId;
    confirmDialog = {
      title: 'Supprimer le dossier',
      message: 'Voulez-vous vraiment supprimer le dossier « ' + box.name + ' » ?',
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
        showToast('Dossier « ' + box.name + ' » supprimé.');
      }
    };
  }

  async function handleLogout() {
    if (!activeAccountId) return;
    const idToRemove = activeAccountId;
    sse?.close();
    await fetch('/api/accounts/' + idToRemove, { method: 'DELETE' });
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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
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
        window.open('/api/jmap/' + accId + '/download/' + encodeURIComponent(jmapAccId) + '/' + encodeURIComponent(m.blobId) + '/' + encodeURIComponent((m.subject || 'message') + '.eml') + '?type=message%2Frfc822', '_blank');
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
        const name = prompt('Nom du sous-dossier dans « ' + folderDisplayName(box) + ' » :');
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
  <div role="status" class="env-card env-accent-text fixed bottom-5 right-5 z-50 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl">
    {statusToast}
  </div>
{/if}

{#if !loaded}
  <div class="env-app env-muted flex h-screen items-center justify-center text-sm">Chargement...</div>
{:else if accounts.length === 0}
  <LoginPage onLoggedIn={loadAccounts} />
{:else}
  <div class="env-app flex h-screen w-screen gap-2.5 overflow-hidden p-2.5">
    <!-- Rail gauche flottant et arrondi -->
    <aside aria-label="Navigation principale" class="env-panel flex shrink-0 flex-col justify-between rounded-3xl border py-3.5 shadow-sm transition-all duration-200 {railExpanded ? 'w-56 px-3.5' : 'w-16 items-center'}">
      <div class="flex flex-col gap-2 {railExpanded ? 'w-full' : 'items-center'}">
        <button
          type="button"
          onclick={() => (railExpanded = !railExpanded)}
          aria-expanded={railExpanded}
          title={railExpanded ? 'Rétracter le menu' : 'Agrandir le menu'}
          class="env-input env-hover env-muted mb-1.5 flex h-10 items-center justify-center rounded-2xl border text-sm font-medium {railExpanded ? 'w-full justify-between px-3.5' : 'w-11'}"
        >
          {#if railExpanded}<span class="env-text font-bold">Enveloppe</span>{/if}
          <span>{railExpanded ? '«' : '»'}</span>
        </button>

        {#each accounts as acc}
          <button
            type="button"
            onclick={() => selectAccount(acc.id)}
            aria-current={activeAccountId === acc.id ? 'true' : undefined}
            title="{acc.label} ({acc.host})"
            class="flex items-center gap-3 rounded-2xl transition-all {railExpanded ? 'w-full px-2.5 py-2 text-left' : 'h-11 w-11 justify-center'} {activeAccountId === acc.id ? 'env-active ring-2 ring-[#48B17F]' : 'opacity-80 hover:opacity-100'}"
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs" style="background-color: {acc.color}; color: #08101A;">
              {acc.label.slice(0, 2).toUpperCase()}
            </span>
            {#if railExpanded}
              <span class="env-text truncate text-sm font-medium">{acc.label}</span>
            {/if}
          </button>
        {/each}

        <button
          type="button"
          onclick={() => (showAccountModal = true)}
          title="Ajouter un serveur"
          class="env-input env-hover env-muted flex items-center gap-3 rounded-2xl border border-dashed text-sm {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'}"
        >
          <span>+</span>
          {#if railExpanded}<span>Ajouter un compte</span>{/if}
        </button>
      </div>

      <div class="flex flex-col gap-1.5 {railExpanded ? 'w-full' : 'items-center'}">
        <button type="button" onclick={() => (activeTab = 'mail')} aria-current={activeTab === 'mail' ? 'page' : undefined} title="Messagerie" class="flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'} {activeTab === 'mail' ? 'env-accent-soft font-semibold' : 'env-muted env-hover'}">
          <span>✉️</span>{#if railExpanded}<span>Messagerie</span>{/if}
        </button>
        <button type="button" onclick={() => (activeTab = 'contacts')} aria-current={activeTab === 'contacts' ? 'page' : undefined} title="Contacts" class="flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'} {activeTab === 'contacts' ? 'env-accent-soft font-semibold' : 'env-muted env-hover'}">
          <span>👤</span>{#if railExpanded}<span>Contacts</span>{/if}
        </button>
        <button type="button" onclick={() => (activeTab = 'calendar')} aria-current={activeTab === 'calendar' ? 'page' : undefined} title="Calendrier" class="flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'} {activeTab === 'calendar' ? 'env-accent-soft font-semibold' : 'env-muted env-hover'}">
          <span>📅</span>{#if railExpanded}<span>Calendrier</span>{/if}
        </button>
        <button type="button" onclick={() => (activeTab = 'sieve')} aria-current={activeTab === 'sieve' ? 'page' : undefined} title="Filtres (Sieve)" class="flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'} {activeTab === 'sieve' ? 'env-accent-soft font-semibold' : 'env-muted env-hover'}">
          <span>⚡</span>{#if railExpanded}<span>Filtres</span>{/if}
        </button>
        <button type="button" onclick={() => (activeTab = 'security')} aria-current={activeTab === 'security' ? 'page' : undefined} title="Sécurité" class="flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'} {activeTab === 'security' ? 'env-accent-soft font-semibold' : 'env-muted env-hover'}">
          <span>🛡️</span>{#if railExpanded}<span>Sécurité</span>{/if}
        </button>

        <div class="env-border my-1 border-t {railExpanded ? 'w-full' : 'w-8'}"></div>

        <button type="button" onclick={cycleTheme} title={themeLabel} aria-label={themeLabel} class="env-muted env-hover flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'}">
          <span>{themeIcon}</span>{#if railExpanded}<span class="truncate">{themeLabel}</span>{/if}
        </button>
        <button type="button" onclick={handleEnablePush} title="Activer les notifications" class="env-muted env-hover flex items-center gap-3 rounded-2xl text-sm font-medium {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'}">
          <span>🔔</span>{#if railExpanded}<span>Notifications</span>{/if}
        </button>
        <button type="button" onclick={handleLogout} title="Déconnecter ce compte" class="env-muted flex items-center gap-3 rounded-2xl text-sm font-medium hover:bg-red-500/15 hover:text-red-400 {railExpanded ? 'w-full px-3.5 py-2.5' : 'h-11 w-11 justify-center'}">
          <span>🚪</span>{#if railExpanded}<span>Déconnexion</span>{/if}
        </button>
      </div>
    </aside>

    {#if activeTab === 'mail'}
      {#if showFolders}
        <nav aria-label="Dossiers de messagerie" class="env-panel flex w-64 shrink-0 flex-col overflow-y-auto rounded-3xl border py-4 shadow-sm">
          <div class="env-faint px-4 pb-2.5 text-xs font-semibold uppercase tracking-wider">Dossiers</div>
          <div class="space-y-0.5 px-2">
            {#each mailboxes as box}
              <div
                role="group"
                oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: 'mailbox', mailbox: box }; }}
                style="padding-left: {8 + (box.depth ?? 0) * 14}px"
                class="group flex items-center justify-between gap-1 rounded-xl pr-2 text-sm transition-colors {activeMailboxId === box.id ? 'env-active env-accent-text font-semibold' : 'env-text env-hover'}"
              >
                <button
                  type="button"
                  onclick={() => selectMailbox(box.id)}
                  class="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
                >
                  <span class="shrink-0">{box.depth ? '📁' : (box.role && ROLE_META[box.role]?.icon) || '📁'}</span>
                  <span class="truncate">{folderDisplayName(box)}</span>
                </button>

                <div class="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Marquer comme lu(s)"
                    aria-label="Marquer comme lu(s)"
                    disabled={batchBusy}
                    onclick={(e) => { e.stopPropagation(); handleMarkMailboxRead(box); }}
                    class="env-muted rounded-lg px-1.5 py-1 text-xs opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                  >
                    ✓
                  </button>

                  {#if box.role === 'trash' || box.role === 'junk'}
                    <button
                      type="button"
                      title={box.role === 'trash' ? 'Vider la corbeille' : 'Supprimer les indésirables'}
                      aria-label={box.role === 'trash' ? 'Vider la corbeille' : 'Supprimer les indésirables'}
                      onclick={(e) => { e.stopPropagation(); requestEmptyMailbox(box); }}
                      class="env-muted rounded-lg px-1.5 py-1 text-xs opacity-0 transition-opacity hover:bg-red-500/15 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                    >
                      🗑️
                    </button>
                  {:else if !box.role}
                    <button
                      type="button"
                      title="Supprimer le dossier"
                      aria-label="Supprimer le dossier"
                      onclick={(e) => { e.stopPropagation(); requestDeleteFolder(box); }}
                      class="env-muted rounded-lg px-1.5 py-1 text-xs opacity-0 transition-opacity hover:bg-red-500/15 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                    >
                      🗑️
                    </button>
                  {/if}

                  {#if box.unreadEmails > 0}
                    <span class="env-accent-soft ml-0.5 rounded-full px-2 py-0.5 text-xs font-semibold">{box.unreadEmails}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          {#if quota}
            <div class="env-border mt-auto border-t p-4">
              <div class="env-muted mb-1.5 flex items-center justify-between text-xs">
                <span>Stockage</span>
                <span class="env-text font-semibold">{quota.percent} %</span>
              </div>
              <div class="env-subtle h-2 w-full overflow-hidden rounded-full">
                <div class="h-full rounded-full transition-all {quota.percent > 85 ? 'bg-red-500' : 'bg-[#48B17F]'}" style="width: {quota.percent}%"></div>
              </div>
              <p class="env-faint mt-1.5 text-xs">{(quota.used / 1048576).toFixed(1)} Mo / {(quota.limit / 1073741824).toFixed(1)} Go</p>
            </div>
          {/if}
        </nav>
      {/if}

      <section aria-label="Liste des messages" class="env-panel flex w-[26rem] shrink-0 flex-col overflow-hidden rounded-3xl border shadow-sm">
        <div class="env-border flex items-center justify-between border-b px-4 py-3.5">
          <div class="flex min-w-0 items-center gap-2.5">
            <button type="button" onclick={() => (showFolders = !showFolders)} title="Afficher/Masquer les dossiers" aria-label="Afficher/Masquer les dossiers" class="env-muted env-hover rounded-xl p-2 text-base">☰</button>
            <span class="env-text truncate text-base font-semibold">{folderDisplayName(activeMailbox)}</span>
          </div>
          <button type="button" onclick={() => (showComposer = true)} class="env-accent-bg shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs hover:opacity-95">Nouveau (C)</button>
        </div>

        {#if activeMailbox}
          <div class="env-subtle env-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs">
            <button
              type="button"
              disabled={batchBusy}
              onclick={() => handleMarkMailboxRead(activeMailbox!)}
              class="env-input env-hover rounded-xl border px-3 py-1.5 font-medium disabled:opacity-50"
            >
              📭 Marquer comme lu(s)
            </button>

            {#if activeMailbox.role === 'trash'}
              <button
                type="button"
                onclick={() => requestEmptyMailbox(activeMailbox!)}
                class="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-semibold text-red-400 hover:bg-red-500/20"
              >
                🔥 Vider la corbeille
              </button>
            {:else if activeMailbox.role === 'junk'}
              <button
                type="button"
                onclick={() => requestEmptyMailbox(activeMailbox!)}
                class="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-semibold text-red-400 hover:bg-red-500/20"
              >
                🗑️ Supprimer les indésirables
              </button>
            {:else if !activeMailbox.role}
              <button
                type="button"
                onclick={() => requestDeleteFolder(activeMailbox!)}
                class="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-semibold text-red-400 hover:bg-red-500/20"
              >
                🗑️ Supprimer le dossier
              </button>
            {/if}
          </div>
        {/if}

        <div class="env-divider flex-1 divide-y overflow-y-auto p-2">
          {#each emails as mail}
            <button
              type="button"
              onclick={() => openEmail(mail)}
              oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: 'mail', mail }; }}
              class="env-hover flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition-colors {selectedEmail?.id === mail.id ? 'env-active' : ''}"
            >
              <SenderAvatar name={mail.from[0]?.name} email={mail.from[0]?.email} />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm {mail.isUnread ? 'env-text font-bold' : 'env-muted font-medium'}">{mail.from[0]?.name || mail.from[0]?.email || 'Inconnu'}</span>
                  <span class="env-faint shrink-0 text-xs">{new Date(mail.receivedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                </div>
                <p class="truncate text-sm {mail.isUnread ? 'env-text font-medium' : 'env-muted'}">{mail.subject || '(Sans objet)'}</p>
                <p class="env-faint truncate text-xs">{mail.preview}</p>
              </div>
            </button>
          {:else}
            <div class="env-faint p-10 text-center text-sm">Aucun message dans ce dossier.</div>
          {/each}
        </div>
      </section>

      <main class="min-w-0 flex-1">
        {#if selectedEmail && activeBody && activeAccountId}
          <MailReader
            accountId={activeAccountId}
            jmapAccountId={activeBody.jmapAccountId}
            subject={selectedEmail.subject}
            from={selectedEmail.from.map((f) => f.name ? f.name + ' <' + f.email + '>' : f.email).join(', ')}
            html={activeBody.html}
            text={activeBody.text}
            attachments={activeBody.attachments}
            onArchive={() => handleArchive(selectedEmail!)}
          />
        {:else}
          <div class="env-card env-faint flex h-full items-center justify-center rounded-3xl border text-sm shadow-sm">Sélectionne un message</div>
        {/if}
      </main>
    {:else if activeTab === 'contacts' && activeAccountId}
      <main class="env-panel min-w-0 flex-1 overflow-hidden rounded-3xl border shadow-sm"><ContactsView accountId={activeAccountId} /></main>
    {:else if activeTab === 'calendar' && activeAccountId}
      <main class="env-panel min-w-0 flex-1 overflow-hidden rounded-3xl border shadow-sm"><CalendarView accountId={activeAccountId} /></main>
    {:else if activeTab === 'sieve' && activeAccountId}
      <main class="env-panel min-w-0 flex-1 overflow-hidden rounded-3xl border shadow-sm"><SieveView accountId={activeAccountId} {mailboxes} prefill={sievePrefill} onPrefillConsumed={() => (sievePrefill = null)} /></main>
    {:else if activeTab === 'security' && activeAccount}
      <main class="env-panel min-w-0 flex-1 overflow-hidden rounded-3xl border shadow-sm"><SecurityView account={activeAccount} onLogout={handleLogout} /></main>
    {/if}
  </div>
{/if}

{#if showAccountModal}
  <AccountModal onAdded={loadAccounts} onClose={() => (showAccountModal = false)} />
{/if}

{#if showComposer}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="composer-title"
    tabindex="-1"
    onclick={() => !uploading && (showComposer = false)}
    onkeydown={(e) => e.key === 'Escape' && !uploading && (showComposer = false)}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
  >
    <div role="presentation" onclick={(e) => e.stopPropagation()} class="w-full max-w-lg">
      <form onsubmit={handleSend} class="env-card space-y-3.5 rounded-3xl border p-7 shadow-2xl">
        <h3 id="composer-title" class="env-text text-lg font-semibold">Nouveau message</h3>
        <input bind:value={composeTo} type="email" aria-label="Destinataire" placeholder="Destinataire" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
        <input bind:value={composeSubject} aria-label="Objet" placeholder="Objet" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
        <textarea bind:value={composeText} rows="7" aria-label="Message" placeholder="Message..." required class="env-input w-full rounded-2xl border p-3.5 text-sm"></textarea>
        <div class="flex items-center justify-between gap-2 pt-1">
          <label class="env-input env-hover env-muted cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-medium">
            {uploading ? 'Upload...' : '📎 Joindre un fichier'}
            <input type="file" multiple onchange={handleFileUpload} class="hidden" />
          </label>
          <div class="flex gap-2">
            <button type="button" onclick={() => (showComposer = false)} class="env-muted env-hover rounded-xl px-4 py-2 text-sm">Annuler</button>
            <button disabled={uploading} class="env-accent-bg rounded-xl px-5 py-2 text-sm font-semibold hover:opacity-95 disabled:opacity-50">Envoyer</button>
          </div>
        </div>
        {#if composeFiles.length}
          <div class="flex flex-wrap gap-1.5 pt-1">
            {#each composeFiles as f}
              <span class="env-subtle env-muted rounded-xl border px-2.5 py-1 text-xs">{f.name}</span>
            {/each}
          </div>
        {/if}
      </form>
    </div>
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
