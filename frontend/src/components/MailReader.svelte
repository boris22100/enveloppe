<script lang="ts">
  import { buildSandboxedEmailDoc } from '../lib/utils/sanitize';
  import { getDownloadUrl, type Attachment } from '../lib/jmap/client';
  import { parseIcsInvitation, respondToIcsInvitation, type ParsedIcsInvitation } from '../lib/jmap/calendar';

  export interface ThreadMessageItem {
    id: string;
    fromLabel: string;
    receivedAt: string;
    preview: string;
    isUnread: boolean;
  }

  let {
    accountId,
    jmapAccountId,
    subject,
    from,
    to = '',
    receivedAt = '',
    html,
    text,
    attachments = [],
    threadMessages = [],
    selectedMessageId = '',
    onSelectThreadMessage,
    onArchive,
    onReply,
    onReplyAll,
    onForward
  }: {
    accountId: string;
    jmapAccountId: string;
    subject: string;
    from: string;
    to?: string;
    receivedAt?: string;
    html: string | null;
    text: string;
    attachments?: Attachment[];
    threadMessages?: ThreadMessageItem[];
    selectedMessageId?: string;
    onSelectThreadMessage?: (id: string) => void;
    onArchive: () => void;
    onReply: () => void;
    onReplyAll: () => void;
    onForward: () => void;
  } = $props();

  let allowImages = $state(false);
  let cidDataUrls = $state<Record<string, string>>({});

  let visibleAttachments = $derived(
    attachments.filter((att) => !(att.disposition === 'inline' && att.cid))
  );

  $effect(() => {
    const inlineAtts = attachments.filter((att) => att.cid && att.type?.startsWith('image/'));
    if (!html || inlineAtts.length === 0) {
      cidDataUrls = {};
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved: Record<string, string> = {};
      for (const att of inlineAtts) {
        if (!att.cid) continue;
        try {
          const res = await fetch(getDownloadUrl(accountId, jmapAccountId, att));
          if (!res.ok) continue;
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const cleanCid = att.cid.replace(/^<|>$/g, '');
          resolved[cleanCid] = dataUrl;
        } catch {
          // ignore broken inline cid
        }
      }
      if (!cancelled) cidDataUrls = resolved;
    })();
    return () => {
      cancelled = true;
    };
  });

  let resolvedHtml = $derived.by(() => {
    if (!html) return null;
    const keys = Object.keys(cidDataUrls);
    if (!keys.length) return html;
    return html.replace(/(src=["'])cid:([^"']+)(["'])/gi, (match, p1, cidRaw, p3) => {
      const clean = cidRaw.replace(/^<|>$/g, '');
      const url = cidDataUrls[clean];
      return url ? `${p1}${url}${p3}` : match;
    });
  });

  let srcdoc = $derived(resolvedHtml ? buildSandboxedEmailDoc(resolvedHtml, allowImages) : '');

  let icsAttachment = $derived(
    attachments.find((att) => att.type?.toLowerCase().includes('text/calendar') || att.name?.toLowerCase().endsWith('.ics'))
  );
  let icsRaw = $state('');
  let icsInvite = $state<ParsedIcsInvitation | null>(null);
  let icsStatus = $state<'accepted' | 'tentative' | 'declined' | null>(null);
  let icsBusy = $state(false);
  let icsError = $state('');

  $effect(() => {
    const att = icsAttachment;
    icsRaw = '';
    icsInvite = null;
    icsStatus = null;
    icsError = '';
    if (!att) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getDownloadUrl(accountId, jmapAccountId, att));
        if (!res.ok) return;
        const text = await res.text();
        if (cancelled) return;
        icsRaw = text;
        icsInvite = parseIcsInvitation(text);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  async function handleIcsResponse(choice: 'accepted' | 'tentative' | 'declined') {
    if (!icsRaw || icsBusy) return;
    icsBusy = true;
    icsError = '';
    try {
      await respondToIcsInvitation(accountId, icsRaw, choice);
      icsStatus = choice;
    } catch (err: any) {
      icsError = err?.message || 'Impossible de mettre à jour le calendrier';
    } finally {
      icsBusy = false;
    }
  }
</script>

<div class="env-card flex h-full flex-col rounded-xl border shadow-sm">
  <header class="env-border flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <h2 class="env-text truncate text-lg font-semibold">{subject || '(Sans objet)'}</h2>
        {#if threadMessages.length > 1}
          <span class="env-accent-soft shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {threadMessages.length} messages
          </span>
        {/if}
      </div>
      <p class="env-muted truncate text-sm">{from}</p>
      {#if to}
        <p class="env-faint truncate text-xs">À : {to}</p>
      {/if}
      {#if receivedAt}
        <p class="env-faint text-xs">{new Date(receivedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={onReply}
        title="Répondre (R)"
        class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium"
      >
        ↩️ Répondre
      </button>
      <button
        type="button"
        onclick={onReplyAll}
        title="Répondre à tous (A)"
        class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium"
      >
        ↩️↩️ Tous
      </button>
      <button
        type="button"
        onclick={onForward}
        title="Transférer (F)"
        class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium"
      >
        ↪️ Transférer
      </button>
      {#if html && !allowImages}
        <button
          type="button"
          onclick={() => (allowImages = true)}
          class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium"
        >
          Images
        </button>
      {/if}
      <button
        type="button"
        onclick={onArchive}
        class="env-accent-soft rounded-xl px-3.5 py-2 text-xs font-semibold hover:opacity-85"
      >
        Archiver (E)
      </button>
    </div>
  </header>

  {#if threadMessages.length > 1 && onSelectThreadMessage}
    <div class="env-subtle env-border flex gap-2 overflow-x-auto border-b px-6 py-2.5">
      {#each threadMessages as item, idx}
        <button
          type="button"
          onclick={() => onSelectThreadMessage(item.id)}
          class="flex max-w-64 shrink-0 flex-col rounded-lg border px-3.5 py-2 text-left text-xs transition-colors {item.id === selectedMessageId ? 'env-active border-[var(--env-accent)]/50' : 'env-card env-hover'}"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="env-text truncate font-semibold">#{idx + 1} · {item.fromLabel}</span>
            <span class="env-faint shrink-0 text-[11px]">{new Date(item.receivedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          </div>
          <span class="env-muted truncate text-[11px]">{item.preview}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if icsInvite}
    <div class="env-subtle env-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
      <div class="min-w-0">
        <p class="env-text text-xs font-semibold">📅 Invitation : {icsInvite.title}</p>
        <p class="env-muted text-xs">
          {new Date(icsInvite.start).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          {#if icsInvite.location} · {icsInvite.location}{/if}
        </p>
        {#if icsStatus === 'accepted' || icsStatus === 'tentative'}
          <p class="env-accent-text text-xs font-medium">✓ Rendez-vous intégré au calendrier ({icsStatus === 'accepted' ? 'confirmé' : 'provisoire'})</p>
        {:else if icsStatus === 'declined'}
          <p class="env-muted text-xs">Invitation marquée comme refusée</p>
        {/if}
        {#if icsError}
          <p class="text-xs text-red-400">{icsError}</p>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          disabled={icsBusy}
          onclick={() => handleIcsResponse('accepted')}
          class="rounded-lg border px-3 py-1.5 font-semibold {icsStatus === 'accepted' ? 'env-accent-bg border-transparent' : 'env-input env-hover'}"
        >✓ Accepter</button>
        <button
          type="button"
          disabled={icsBusy}
          onclick={() => handleIcsResponse('tentative')}
          class="rounded-lg border px-3 py-1.5 font-medium {icsStatus === 'tentative' ? 'env-accent-soft border-[var(--env-accent)]/50' : 'env-input env-hover'}"
        >? Peut-être</button>
        <button
          type="button"
          disabled={icsBusy}
          onclick={() => handleIcsResponse('declined')}
          class="rounded-lg border px-3 py-1.5 font-medium {icsStatus === 'declined' ? 'border-red-500/60 bg-red-500/15 text-red-400' : 'env-input env-hover'}"
        >✕ Refuser</button>
      </div>
    </div>
  {/if}

  {#if visibleAttachments.length > 0}
    <div class="env-subtle env-border flex flex-wrap gap-2 border-b px-6 py-3">
      {#each visibleAttachments as att}
        <a
          href={getDownloadUrl(accountId, jmapAccountId, att)}
          download={att.name}
          class="env-input env-hover inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-medium"
        >
          <span>📎 {att.name || 'fichier'}</span>
          <span class="env-faint">({Math.max(1, Math.round(att.size / 1024))} Ko)</span>
        </a>
      {/each}
    </div>
  {/if}

  <div class="flex-1 overflow-auto p-6">
    {#if html}
      <iframe
        title="Contenu du message"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        {srcdoc}
        class="h-full w-full rounded-lg border-0"
      ></iframe>
    {:else}
      <pre class="env-text whitespace-pre-wrap font-sans text-sm leading-relaxed">{text}</pre>
    {/if}
  </div>
</div>
