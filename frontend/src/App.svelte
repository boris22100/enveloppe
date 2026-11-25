<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { db, type CachedEmail } from './lib/db/cache';
  import {
    archiveEmail, createMailbox, deleteMailbox, destroyEmail, emptyMailboxes, fetchEmailBody, fetchMailboxes, fetchMailboxEmails, fetchQuota, getMailboxSubtreeIds, getPrimaryAccountId, markMailboxesAsRead, renameMailbox, ROLE_META, setEmailKeyword, updateEmailMailbox,
    searchEmails, sendEmail, uploadAttachment, type Account, type Attachment, type DiskQuota, type Mailbox
  } from './lib/jmap/client';
  import { enableWebPush } from './lib/jmap/push';
  import { applyTheme, getSavedTheme, type ThemeMode } from './lib/theme';
  import { getAccountSignature } from './lib/signatures';
  import { getLocale, setLocale, t, type Locale } from './lib/i18n';
  import LoginPage from './components/LoginPage.svelte';
  import AccountModal from './components/AccountModal.svelte';
  import MailReader, { type ThreadMessageItem } from './components/MailReader.svelte';
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
    themeMode = themeMode === 'bowiz' ? 'dark' : themeMode === 'dark' ? 'light' : 'bowiz';
  }

  let themeLabel = $derived(
    themeMode === 'bowiz' ? 'Thème : BoWiz' : themeMode === 'dark' ? 'Thème : Sombre' : 'Thème : Clair'
  );
  let themeIcon = $derived(
    themeMode === 'bowiz' ? '💠' : themeMode === 'dark' ? '🌙' : '☀️'
  );

  let lang = $state<Locale>(getLocale());
  function switchLang(next: Locale) { lang = next; setLocale(next); }
  let appVersion = $state(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.8.3');
  let accounts = $state<Account[]>([]);
  let loaded = $state(false);
  let activeAccountId = $state<string | null>(null);
  const savedTab = typeof localStorage !== 'undefined' ? localStorage.getItem('enveloppe_tab') : null;
  let activeTab = $state<'mail' | 'contacts' | 'calendar' | 'sieve' | 'security'>(
    (savedTab === 'mail' || savedTab === 'contacts' || savedTab === 'calendar' || savedTab === 'sieve' || savedTab === 'security') ? savedTab : 'mail'
  );
  let sievePrefill = $state<{ from?: string; subject?: string } | null>(null);
  const savedRail = typeof localStorage !== 'undefined' ? localStorage.getItem('enveloppe_rail_expanded') : null;
  let railExpanded = $state(savedRail === null ? true : savedRail === 'true');

  let mailboxes = $state<Mailbox[]>([]);
  let activeMailboxId = $state<string | null>(null);
  let showFolders = $state(true);
  let quota = $state<DiskQuota | null>(null);

  let emails = $state<CachedEmail[]>([]);
  let serverSearchResults = $state<CachedEmail[] | null>(null);
  let searchingServer = $state(false);
  let searchQuery = $state('');
  let filterUnreadOnly = $state(false);
  let filterAttachmentsOnly = $state(false);
  let groupThreads = $state(true);

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
  let draggedMail = $state<CachedEmail | null>(null);
  let dropTargetMailboxId = $state<string | null>(null);
  let sse: EventSource | null = null;

  let confirmDialog = $state<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  let activeAccount = $derived(accounts.find((a) => a.id === activeAccountId) ?? null);
  let activeMailbox = $derived(mailboxes.find((m) => m.id === activeMailboxId) ?? null);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  async function runServerSearch() {
    if (!activeAccountId) return;
    const q = searchQuery.trim();
    if (!q && !filterUnreadOnly && !filterAttachmentsOnly) {
      serverSearchResults = null;
      searchingServer = false;
      return;
    }
    searchingServer = true;
    try {
      const list = await searchEmails(activeAccountId, {
        query: q || undefined,
        mailboxId: activeMailboxId,
        unreadOnly: filterUnreadOnly,
        hasAttachment: filterAttachmentsOnly,
        limit: 100
      });
      serverSearchResults = list.map((e: any) => ({
        uid: activeAccountId + ':' + e.id,
        accountId: activeAccountId,
        id: e.id,
        blobId: e.blobId,
        subject: e.subject || '(Sans objet)',
        from: e.from || [],
        receivedAt: e.receivedAt || '',
        preview: e.preview || '',
        isUnread: !(e.keywords && e.keywords['$seen']),
        isFlagged: Boolean(e.keywords && e.keywords['$flagged']),
        mailboxIds: e.mailboxIds || {}
      }));
    } catch {
      serverSearchResults = null;
    } finally {
      searchingServer = false;
    }
  }

  $effect(() => {
    const _q = searchQuery;
    const _u = filterUnreadOnly;
    const _a = filterAttachmentsOnly;
    const _m = activeMailboxId;
    const _acc = activeAccountId;
    if (searchTimer) clearTimeout(searchTimer);
    if (!_acc || (!_q.trim() && !_u && !_a)) {
      serverSearchResults = null;
      searchingServer = false;
      return;
    }
    searchTimer = setTimeout(() => {
      void runServerSearch();
    }, 280);
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  let filteredEmails = $derived.by(() => {
    const source = serverSearchResults ?? emails;
    const q = searchQuery.trim().toLowerCase();
    if (serverSearchResults) return source;
    return source.filter((m) => {
      if (filterUnreadOnly && !m.isUnread) return false;
      if (filterAttachmentsOnly && !m.hasAttachment) return false;
      if (!q) return true;
      const fromStr = (m.from ?? []).map((f) => (f.name || '') + ' ' + f.email).join(' ').toLowerCase();
      const subj = (m.subject || '').toLowerCase();
      const prev = (m.preview || '').toLowerCase();
      return fromStr.includes(q) || subj.includes(q) || prev.includes(q);
    });
  });

  interface MailListEntry {
    key: string;
    lead: CachedEmail;
    threadItems: CachedEmail[];
    unreadCount: number;
    hasAttachment: boolean;
  }

  let displayedEntries = $derived.by<MailListEntry[]>(() => {
    if (!groupThreads) {
      return filteredEmails.map((m) => ({
        key: m.id,
        lead: m,
        threadItems: [m],
        unreadCount: m.isUnread ? 1 : 0,
        hasAttachment: Boolean(m.hasAttachment)
      }));
    }
    const map = new Map<string, CachedEmail[]>();
    const order: string[] = [];
    for (const m of filteredEmails) {
      const tKey = m.threadId || m.id;
      if (!map.has(tKey)) {
        map.set(tKey, []);
        order.push(tKey);
      }
      map.get(tKey)!.push(m);
    }
    return order.map((tKey) => {
      const items = map.get(tKey)!;
      const lead = items[0];
      return {
        key: tKey,
        lead,
        threadItems: items,
        unreadCount: items.filter((x) => x.isUnread).length,
        hasAttachment: items.some((x) => Boolean(x.hasAttachment))
      };
    });
  });

  let activeThreadMessages = $derived.by<ThreadMessageItem[]>(() => {
    if (!selectedEmail) return [];
    const tKey = selectedEmail.threadId || selectedEmail.id;
    const sameThread = emails.filter((m) => (m.threadId || m.id) === tKey);
    if (sameThread.length <= 1) return [];
    return [...sameThread].reverse().map((m) => ({
      id: m.id,
      fromLabel: m.from?.[0]?.name || m.from?.[0]?.email || 'Inconnu',
      receivedAt: m.receivedAt,
      preview: m.preview || '(Sans aperçu)',
      isUnread: m.isUnread
    }));
  });

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
    localStorage.setItem('enveloppe_rail_expanded', String(railExpanded));
    if (activeAccountId) localStorage.setItem('enveloppe_account', activeAccountId);
    if (activeMailboxId) localStorage.setItem('enveloppe_mailbox', activeMailboxId);
  });

  async function loadVersion() {
    try {
      const res = await fetch('/api/version');
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.version === 'string' && data.version.trim()) {
          appVersion = data.version.trim();
        }
      }
    } catch {}
  }

  async function loadAccounts() {
    await loadVersion();
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
    emails = list.map((e: any) => ({
      uid: accountId + ':' + e.id,
      accountId,
      id: e.id,
      threadId: e.threadId,
      blobId: e.blobId,
      subject: e.subject,
      from: e.from ?? [],
      receivedAt: e.receivedAt,
      preview: e.preview,
      keywords: e.keywords ?? {},
      isUnread: !e.keywords?.['$seen'],
      hasAttachment: Boolean(e.hasAttachment)
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

  
  $effect(() => {
    if (typeof window === 'undefined') return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ email?: string; name?: string }>).detail;
      if (detail?.email) openNewComposerTo(detail.email, detail.name);
    };
    window.addEventListener('enveloppe:compose', handler);
    return () => window.removeEventListener('enveloppe:compose', handler);
  });

  function openNewComposerTo(email: string, name?: string) {
    const sig = getAccountSignature(activeAccountId);
    composeTo = name ? `${name} <${email}>` : email;
    composeSubject = '';
    composeText = sig ? '\n\n' + sig : '';
    composeFiles = [];
    activeTab = 'mail';
    showComposer = true;
  }

  function openNewComposer() {
    const sig = getAccountSignature(activeAccountId);
    composeTo = '';
    composeSubject = '';
    composeText = sig ? '\n\n' + sig : '';
    composeFiles = [];
    showComposer = true;
  }

  function formatQuotedBody(): string {
    const raw = (activeBody?.text || selectedEmail?.preview || '').trim();
    const quoted = raw
      .split('\n')
      .map((line) => '> ' + line)
      .join('\n');
    const who = selectedEmail?.from?.[0]?.email || selectedEmail?.from?.[0]?.name || '';
    const dateStr = selectedEmail?.receivedAt
      ? new Date(selectedEmail.receivedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    const sig = getAccountSignature(activeAccountId);
    const sigBlock = sig ? '\n\n' + sig : '';
    return sigBlock + '\n\n--- Le ' + dateStr + ', ' + who + ' a écrit :\n' + quoted;
  }

  function startReply(all = false) {
    if (!selectedEmail) return;
    const sender = selectedEmail.from?.[0]?.email || '';
    const others = all && activeAccount?.username ? activeAccount.username : '';
    composeTo = [sender, others].filter(Boolean).join(', ');
    const baseSubj = selectedEmail.subject || '(Sans objet)';
    composeSubject = /^re:/i.test(baseSubj) ? baseSubj : 'Re: ' + baseSubj;
    composeText = formatQuotedBody();
    composeFiles = [];
    showComposer = true;
  }

  function startForward() {
    if (!selectedEmail) return;
    composeTo = '';
    const baseSubj = selectedEmail.subject || '(Sans objet)';
    composeSubject = /^fwd?:/i.test(baseSubj) ? baseSubj : 'Fwd: ' + baseSubj;
    composeText = formatQuotedBody();
    composeFiles = [];
    showComposer = true;
  }

  function handleMailDragStart(e: DragEvent, mail: CachedEmail) {
    draggedMail = mail;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', mail.id);
    }
  }

  function handleMailDragEnd() {
    draggedMail = null;
    dropTargetMailboxId = null;
  }

  async function handleDropOnMailbox(e: DragEvent, targetBox: Mailbox) {
    e.preventDefault();
    const mail = draggedMail;
    draggedMail = null;
    dropTargetMailboxId = null;
    if (!mail || !activeAccountId) return;
    if (activeMailboxId && activeMailboxId === targetBox.id) return;
    try {
      await updateEmailMailbox(activeAccountId, mail.id, targetBox.id);
      emails = emails.filter((item) => item.id !== mail.id);
      if (selectedEmail?.id === mail.id) {
        selectedEmail = null;
        activeBody = null;
      }
      mailboxes = await fetchMailboxes(activeAccountId);
      showToast('Déplacé vers « ' + folderDisplayName(targetBox) + ' ».');
    } catch (err: any) {
      showToast(err?.message || 'Échec du déplacement du message.');
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

  function removeComposeFile(index: number) {
    composeFiles = composeFiles.filter((_, idx) => idx !== index);
  }

  async function handleFileUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || !activeAccountId) return;
    uploading = true;
    try {
      for (const f of Array.from(files)) {
        composeFiles = [...composeFiles, await uploadAttachment(activeAccountId, f)];
      }
      (e.target as HTMLInputElement).value = '';
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
    if (confirmDialog || showComposer || showAccountModal || activeTab !== 'mail') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    const k = e.key.toLowerCase();
    if (k === 'c') { e.preventDefault(); openNewComposer(); }
    else if (k === 'e' && selectedEmail) { e.preventDefault(); handleArchive(selectedEmail); }
    else if (k === 'r' && selectedEmail) { e.preventDefault(); startReply(e.shiftKey); }
    else if (k === 'a' && selectedEmail) { e.preventDefault(); startReply(true); }
    else if (k === 'f' && selectedEmail) { e.preventDefault(); startForward(); }
    else if (e.key === 'Delete' && selectedEmail) { e.preventDefault(); requestDeleteMail(selectedEmail); }
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
  <div role="status" class="env-card env-accent-text fixed bottom-5 right-5 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-xl">
    {statusToast}
  </div>
{/if}

{#if !loaded}
  <div class="env-app env-muted flex h-screen items-center justify-center text-sm">Chargement...</div>
{:else if accounts.length === 0}
  <LoginPage onLoggedIn={loadAccounts} />
{:else}
  <div class="env-app flex h-screen w-screen overflow-hidden">
    <!-- Barre latérale style AdGuard Home 1.0 -->
    <aside aria-label="Navigation principale" class="env-sidebar flex shrink-0 flex-col justify-between border-r transition-all duration-150 {railExpanded ? 'w-64' : 'w-16'}">
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <!-- En-tête marque + bascule -->
        <div class="env-border flex h-14 shrink-0 items-center justify-between border-b px-3.5">
          {#if railExpanded}
            <div class="flex items-center gap-2.5">
              <span class="env-accent-bg flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold">✉</span>
              <div class="flex items-baseline gap-1.5 leading-tight">
                <span class="env-text text-sm font-bold tracking-tight">enveloppe</span>
                <span class="env-faint text-xs font-normal">jmap</span>
                <span class="env-faint text-[11px] font-mono opacity-75">v{appVersion}</span>
              </div>
            </div>
          {/if}
          <button
            type="button"
            onclick={() => (railExpanded = !railExpanded)}
            aria-expanded={railExpanded}
            title={railExpanded ? 'Rétracter le menu' : 'Déplier le menu'}
            class="env-muted env-hover flex h-8 w-8 items-center justify-center rounded-lg text-sm {railExpanded ? '' : 'mx-auto'}"
          >
            {railExpanded ? '«' : '»'}
          </button>
        </div>

        <!-- Sélecteur de comptes -->
        <div class="env-border border-b p-2.5 {railExpanded ? 'space-y-1' : 'flex flex-col items-center gap-1.5'}">
          {#each accounts as acc}
            <button
              type="button"
              onclick={() => selectAccount(acc.id)}
              aria-current={activeAccountId === acc.id ? 'true' : undefined}
              title="{acc.label} ({acc.host})"
              class="flex items-center gap-2.5 rounded-lg text-sm transition-colors {railExpanded ? 'w-full px-2.5 py-1.5 text-left' : 'h-9 w-9 justify-center'} {activeAccountId === acc.id ? 'env-active env-accent-text font-semibold' : 'env-muted env-hover'}"
            >
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold" style="background-color: {acc.color}; color: #08101A;">
                {acc.label.slice(0, 2).toUpperCase()}
              </span>
              {#if railExpanded}
                <span class="truncate">{acc.label}</span>
              {/if}
            </button>
          {/each}
          <button
            type="button"
            onclick={() => (showAccountModal = true)}
            title="Ajouter un compte"
            class="env-muted env-hover flex items-center gap-2.5 rounded-lg text-xs font-medium {railExpanded ? 'w-full px-2.5 py-1.5' : 'h-8 w-8 justify-center'}"
          >
            <span>+</span>
            {#if railExpanded}<span>Ajouter un compte</span>{/if}
          </button>
        </div>

        <!-- Menu principal (style AdGuard 1.0) -->
        <nav aria-label="Sections principales" class="space-y-0.5 p-2.5 {railExpanded ? '' : 'flex flex-col items-center'}">
          <button type="button" onclick={() => (activeTab = 'mail')} aria-current={activeTab === 'mail' ? 'page' : undefined} title="Messagerie" class="flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-2' : 'h-9 w-9 justify-center'} {activeTab === 'mail' ? 'env-accent-text env-active font-semibold' : 'env-muted env-hover'}">
            <span>✉️</span>{#if railExpanded}<span>Messagerie</span>{/if}
          </button>

          <!-- Sous-arborescence Dossiers intégrée à la sidebar quand Messagerie est actif et déplié -->
          {#if activeTab === 'mail' && railExpanded && showFolders}
            <div class="space-y-0.5 py-1 pl-3">
              {#each mailboxes as box}
                <div
                  role="group"
                  ondragover={(e) => { if (draggedMail && activeMailboxId !== box.id) { e.preventDefault(); dropTargetMailboxId = box.id; } }}
                  ondragleave={() => { if (dropTargetMailboxId === box.id) dropTargetMailboxId = null; }}
                  ondrop={(e) => handleDropOnMailbox(e, box)}
                  oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: 'mailbox', mailbox: box }; }}
                  style="padding-left: {8 + (box.depth ?? 0) * 12}px"
                  class="group flex items-center justify-between gap-1 rounded-lg pr-1.5 text-xs transition-colors {dropTargetMailboxId === box.id ? 'ring-2 ring-[var(--env-accent)] env-active font-semibold' : ''} {activeMailboxId === box.id ? 'env-active env-accent-text font-semibold' : 'env-muted env-hover'}"
                >
                  <button
                    type="button"
                    onclick={() => selectMailbox(box.id)}
                    class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                  >
                    <span class="shrink-0 opacity-80">{box.depth ? '📁' : (box.role && ROLE_META[box.role]?.icon) || '📁'}</span>
                    <span class="truncate">{folderDisplayName(box)}</span>
                  </button>
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Marquer comme lu(s)"
                      aria-label="Marquer comme lu(s)"
                      disabled={batchBusy}
                      onclick={(e) => { e.stopPropagation(); handleMarkMailboxRead(box); }}
                      class="env-faint rounded px-1 py-0.5 text-[11px] opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                    >✓</button>
                    {#if box.role === 'trash' || box.role === 'junk'}
                      <button
                        type="button"
                        title={box.role === 'trash' ? 'Vider la corbeille' : 'Supprimer les indésirables'}
                        aria-label={box.role === 'trash' ? 'Vider la corbeille' : 'Supprimer les indésirables'}
                        onclick={(e) => { e.stopPropagation(); requestEmptyMailbox(box); }}
                        class="env-faint rounded px-1 py-0.5 text-[11px] opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                      >🗑️</button>
                    {:else if !box.role}
                      <button
                        type="button"
                        title="Supprimer le dossier"
                        aria-label="Supprimer le dossier"
                        onclick={(e) => { e.stopPropagation(); requestDeleteFolder(box); }}
                        class="env-faint rounded px-1 py-0.5 text-[11px] opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                      >🗑️</button>
                    {/if}
                    {#if box.unreadEmails > 0}
                      <span class="env-accent-soft rounded-full px-1.5 py-0.5 text-[11px] font-semibold">{box.unreadEmails}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <button type="button" onclick={() => (activeTab = 'contacts')} aria-current={activeTab === 'contacts' ? 'page' : undefined} title="Contacts" class="flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-2' : 'h-9 w-9 justify-center'} {activeTab === 'contacts' ? 'env-accent-text env-active font-semibold' : 'env-muted env-hover'}">
            <span>👤</span>{#if railExpanded}<span>Contacts</span>{/if}
          </button>
          <button type="button" onclick={() => (activeTab = 'calendar')} aria-current={activeTab === 'calendar' ? 'page' : undefined} title="Calendrier" class="flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-2' : 'h-9 w-9 justify-center'} {activeTab === 'calendar' ? 'env-accent-text env-active font-semibold' : 'env-muted env-hover'}">
            <span>📅</span>{#if railExpanded}<span>Calendrier</span>{/if}
          </button>
          <button type="button" onclick={() => (activeTab = 'sieve')} aria-current={activeTab === 'sieve' ? 'page' : undefined} title="Filtres (Sieve)" class="flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-2' : 'h-9 w-9 justify-center'} {activeTab === 'sieve' ? 'env-accent-text env-active font-semibold' : 'env-muted env-hover'}">
            <span>⚡</span>{#if railExpanded}<span>Filtres</span>{/if}
          </button>
          <button type="button" onclick={() => (activeTab = 'security')} aria-current={activeTab === 'security' ? 'page' : undefined} title="Sécurité & Signatures" class="flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-2' : 'h-9 w-9 justify-center'} {activeTab === 'security' ? 'env-accent-text env-active font-semibold' : 'env-muted env-hover'}">
            <span>🛡️</span>{#if railExpanded}<span>Sécurité</span>{/if}
          </button>
        </nav>
      </div>

      <!-- Pied de barre latérale : stockage, thème, notifications, déconnexion -->
      <div class="env-border shrink-0 space-y-1 border-t p-2.5 {railExpanded ? '' : 'flex flex-col items-center'}">
        {#if quota && railExpanded}
          <div class="env-card mb-2 rounded-lg border p-2.5">
            <div class="env-muted mb-1 flex items-center justify-between text-[11px]">
              <span>Stockage</span>
              <span class="env-text font-semibold">{quota.percent} %</span>
            </div>
            <div class="env-subtle h-1.5 w-full overflow-hidden rounded-full">
              <div class="h-full rounded-full {quota.percent > 85 ? 'bg-red-500' : 'bg-[var(--env-accent)]'}" style="width: {quota.percent}%"></div>
            </div>
            <p class="env-faint mt-1 text-[11px]">{(quota.used / 1048576).toFixed(1)} Mo / {(quota.limit / 1073741824).toFixed(1)} Go</p>
          </div>
        {/if}

        <div
          role="group"
          aria-label="Langue / Language"
          class="env-muted flex items-center rounded-lg text-xs font-medium {railExpanded ? 'w-full justify-between px-3 py-1.5' : 'h-9 w-9 justify-center'}"
        >
          {#if railExpanded}
            <span class="truncate">🌐 Langue</span>
            <div class="inline-flex items-center gap-1">
              <button
                type="button"
                onclick={() => switchLang('fr')}
                aria-pressed={lang === 'fr'}
                class={lang === 'fr' ? 'env-text rounded px-1.5 py-0.5 font-semibold underline' : 'rounded px-1.5 py-0.5 opacity-70 hover:opacity-100'}
              >
                FR
              </button>
              <span class="opacity-40">|</span>
              <button
                type="button"
                onclick={() => switchLang('en')}
                aria-pressed={lang === 'en'}
                class={lang === 'en' ? 'env-text rounded px-1.5 py-0.5 font-semibold underline' : 'rounded px-1.5 py-0.5 opacity-70 hover:opacity-100'}
              >
                EN
              </button>
            </div>
          {:else}
            <button
              type="button"
              onclick={() => switchLang(lang === 'fr' ? 'en' : 'fr')}
              title={lang === 'fr' ? 'Passer en anglais (EN)' : 'Switch to French (FR)'}
              aria-label={lang === 'fr' ? 'Passer en anglais (EN)' : 'Switch to French (FR)'}
              class="env-hover flex h-full w-full items-center justify-center rounded-lg font-semibold uppercase"
            >
              {lang}
            </button>
          {/if}
        </div>

        <button type="button" onclick={cycleTheme} title={themeLabel} aria-label={themeLabel} class="env-muted env-hover flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-1.5' : 'h-9 w-9 justify-center'}">
          <span>{themeIcon}</span>{#if railExpanded}<span class="truncate">{themeLabel}</span>{/if}
        </button>
        <button type="button" onclick={handleEnablePush} title="Notifications" class="env-muted env-hover flex items-center gap-3 rounded-lg text-sm {railExpanded ? 'w-full px-3 py-1.5' : 'h-9 w-9 justify-center'}">
          <span>🔔</span>{#if railExpanded}<span>Notifications</span>{/if}
        </button>
        <button type="button" onclick={handleLogout} title="Déconnexion" class="env-muted flex items-center gap-3 rounded-lg text-sm hover:bg-red-500/10 hover:text-red-500 {railExpanded ? 'w-full px-3 py-1.5' : 'h-9 w-9 justify-center'}">
          <span>🚪</span>{#if railExpanded}<span>Déconnexion</span>{/if}
        </button>
      </div>
    </aside>

    <!-- Zone principale style AdGuard Home 1.0 (en-tête net + cartes blanches/sombres à bordures fines) -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      {#if activeTab === 'mail'}
        <header class="env-panel env-border flex h-14 shrink-0 items-center justify-between gap-4 border-b px-6">
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onclick={() => {
                if (!railExpanded) { railExpanded = true; showFolders = true; }
                else { showFolders = !showFolders; }
              }}
              title="Afficher/Masquer les dossiers"
              aria-label="Afficher/Masquer les dossiers"
              class="env-muted env-hover rounded-lg p-1.5 text-base"
            >☰</button>
            <h1 class="env-text truncate text-xl font-bold tracking-tight">{folderDisplayName(activeMailbox)}</h1>
            {#if activeMailbox && activeMailbox.unreadEmails > 0}
              <span class="env-accent-soft rounded-full px-2.5 py-0.5 text-xs font-semibold">{activeMailbox.unreadEmails} non lu(s)</span>
            {/if}
          </div>

          <div class="flex items-center gap-2.5">
            {#if activeMailbox}
              <button
                type="button"
                disabled={batchBusy}
                onclick={() => handleMarkMailboxRead(activeMailbox!)}
                class="env-input env-hover env-muted rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                ✓ Tout marquer lu
              </button>
            {/if}
            <button type="button" onclick={openNewComposer} class="env-accent-bg rounded-lg px-4 py-1.5 text-xs font-semibold shadow-2xs hover:opacity-95">
              Nouveau message (C)
            </button>
          </div>
        </header>

        <div class="flex min-h-0 flex-1 gap-5 overflow-hidden p-5">
          <!-- Carte liste des messages -->
          <section aria-label="Liste des messages" class="env-card flex w-[26rem] shrink-0 flex-col overflow-hidden rounded-xl border shadow-2xs">
            <div class="env-border space-y-2 border-b p-3.5">
              <div class="relative flex items-center">
                <input
                  bind:value={searchQuery}
                  type="search"
                  aria-label="Rechercher dans les messages"
                  placeholder="Rechercher (expéditeur, objet, texte)..."
                  class="env-input w-full rounded-lg border py-1.5 pl-3 pr-8 text-xs"
                />
                {#if searchQuery}
                  <button
                    type="button"
                    onclick={() => (searchQuery = '')}
                    aria-label="Effacer la recherche"
                    class="env-faint hover:env-text absolute right-2.5 text-xs"
                  >✕</button>
                {/if}
              </div>

              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onclick={() => (filterUnreadOnly = !filterUnreadOnly)}
                  class="rounded-md border px-2.5 py-1 font-medium {filterUnreadOnly ? 'env-accent-soft border-[var(--env-accent)]/50 font-semibold' : 'env-input env-muted'}"
                >Non lus</button>
                <button
                  type="button"
                  onclick={() => (filterAttachmentsOnly = !filterAttachmentsOnly)}
                  class="rounded-md border px-2.5 py-1 font-medium {filterAttachmentsOnly ? 'env-accent-soft border-[var(--env-accent)]/50 font-semibold' : 'env-input env-muted'}"
                >📎 PJ</button>
                <button
                  type="button"
                  onclick={() => (groupThreads = !groupThreads)}
                  class="rounded-md border px-2.5 py-1 font-medium {groupThreads ? 'env-accent-soft border-[var(--env-accent)]/50 font-semibold' : 'env-input env-muted'}"
                >Fils</button>
              </div>
            </div>

            <div class="env-divider flex-1 divide-y overflow-y-auto">
              {#each displayedEntries as entry}
                {@const mail = entry.lead}
                {@const isRowUnread = entry.unreadCount > 0 || mail.isUnread}
                <button
                  type="button"
                  draggable={true}
                  ondragstart={(e) => handleMailDragStart(e, mail)}
                  ondragend={handleMailDragEnd}
                  onclick={() => openEmail(mail)}
                  oncontextmenu={(e) => { e.preventDefault(); ctxMenu = { x: e.clientX, y: e.clientY, type: 'mail', mail }; }}
                  class="env-hover flex w-full items-center gap-3 px-4 py-3 text-left transition-colors {selectedEmail?.id === mail.id ? 'env-active' : ''} {draggedMail?.id === mail.id ? 'opacity-60' : ''}"
                >
                  <SenderAvatar name={mail.from[0]?.name} email={mail.from[0]?.email} />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate text-sm {isRowUnread ? 'env-text font-bold' : 'env-muted font-medium'}">{mail.from[0]?.name || mail.from[0]?.email || 'Inconnu'}</span>
                      <div class="flex shrink-0 items-center gap-1.5">
                        {#if entry.hasAttachment}
                          <span class="env-faint text-xs" title="Pièce jointe">📎</span>
                        {/if}
                        {#if entry.threadItems.length > 1}
                          <span class="env-accent-soft rounded-full px-1.5 py-0.5 text-[11px] font-semibold">{entry.threadItems.length}</span>
                        {/if}
                        <span class="env-faint text-xs tabular-nums">{new Date(mail.receivedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                      </div>
                    </div>
                    <p class="truncate text-sm {isRowUnread ? 'env-text font-medium' : 'env-muted'}">{mail.subject || '(Sans objet)'}</p>
                    <p class="env-faint truncate text-xs">{mail.preview}</p>
                  </div>
                </button>
              {:else}
                <div class="env-faint p-10 text-center text-sm">
                  {searchQuery || filterUnreadOnly || filterAttachmentsOnly ? 'Aucun message ne correspond aux filtres.' : 'Aucun message dans ce dossier.'}
                </div>
              {/each}
            </div>
          </section>

          <!-- Carte lecteur de message -->
          <main class="min-w-0 flex-1">
            {#if selectedEmail && activeBody && activeAccountId}
              <MailReader
                accountId={activeAccountId}
                jmapAccountId={activeBody.jmapAccountId}
                subject={selectedEmail.subject}
                from={selectedEmail.from.map((f) => f.name ? f.name + ' <' + f.email + '>' : f.email).join(', ')}
                receivedAt={selectedEmail.receivedAt}
                html={activeBody.html}
                text={activeBody.text}
                attachments={activeBody.attachments}
                threadMessages={activeThreadMessages}
                selectedMessageId={selectedEmail.id}
                onSelectThreadMessage={async (msgId) => {
                  const found = emails.find((x) => x.id === msgId);
                  if (found) await openEmail(found);
                }}
                onArchive={() => handleArchive(selectedEmail!)}
                onReply={() => startReply(false)}
                onReplyAll={() => startReply(true)}
                onForward={startForward}
              />
            {:else}
              <div class="env-card env-faint flex h-full items-center justify-center rounded-xl border text-sm shadow-2xs">Sélectionne un message</div>
            {/if}
          </main>
        </div>
      {:else if activeTab === 'contacts' && activeAccountId}
        <main class="min-w-0 flex-1 overflow-hidden p-5"><div class="env-card h-full overflow-hidden rounded-xl border shadow-2xs"><ContactsView accountId={activeAccountId} onComposeTo={openNewComposerTo} /></div></main>
      {:else if activeTab === 'calendar' && activeAccountId}
        <main class="min-w-0 flex-1 overflow-hidden p-5"><div class="env-card h-full overflow-hidden rounded-xl border shadow-2xs"><CalendarView accountId={activeAccountId} organizerEmail={activeAccount?.username || ''} /></div></main>
      {:else if activeTab === 'sieve' && activeAccountId}
        <main class="min-w-0 flex-1 overflow-hidden p-5"><div class="env-card h-full overflow-hidden rounded-xl border shadow-2xs"><SieveView accountId={activeAccountId} {mailboxes} prefill={sievePrefill} onPrefillConsumed={() => (sievePrefill = null)} /></div></main>
      {:else if activeTab === 'security' && activeAccount}
        <main class="min-w-0 flex-1 overflow-hidden p-5"><div class="env-card h-full overflow-hidden rounded-xl border shadow-2xs"><SecurityView account={activeAccount} onLogout={handleLogout} /></div></main>
      {/if}
    </div>
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
      <form onsubmit={handleSend} class="env-card space-y-3.5 rounded-xl border p-7 shadow-2xl">
        <h3 id="composer-title" class="env-text text-lg font-semibold">Nouveau message</h3>
        <input bind:value={composeTo} type="text" aria-label="Destinataire" placeholder="Destinataire(s)" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
        <input bind:value={composeSubject} aria-label="Objet" placeholder="Objet" required class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm" />
        <textarea bind:value={composeText} rows="9" aria-label="Message" placeholder="Message..." required class="env-input w-full rounded-lg border p-3.5 text-sm"></textarea>
        <div class="flex items-center justify-between gap-2 pt-1">
          <label class="env-input env-hover env-muted cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-medium">
            {uploading ? 'Upload...' : '📎 Joindre un fichier'}
            <input type="file" multiple onchange={handleFileUpload} class="hidden" aria-label="Joindre des fichiers" />
          </label>
          <div class="flex gap-2">
            <button type="button" onclick={() => (showComposer = false)} class="env-muted env-hover rounded-xl px-4 py-2 text-sm">Annuler</button>
            <button disabled={uploading} class="env-accent-bg rounded-xl px-5 py-2 text-sm font-semibold hover:opacity-95 disabled:opacity-50">Envoyer</button>
          </div>
        </div>
        {#if composeFiles.length}
          <div class="flex flex-wrap gap-1.5 pt-1">
            {#each composeFiles as f, idx}
              <span class="env-subtle env-muted inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs">
                <span>{f.name}</span>
                <button
                  type="button"
                  onclick={() => removeComposeFile(idx)}
                  aria-label="Retirer {f.name}"
                  class="hover:opacity-75"
                >
                  ✕
                </button>
              </span>
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
