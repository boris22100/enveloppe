<script lang="ts">
  import { buildSandboxedEmailDoc } from '../lib/utils/sanitize';
  import { getDownloadUrl, type Attachment } from '../lib/jmap/client';

  let { accountId, jmapAccountId, subject, from, html, text, attachments = [], onArchive }: {
    accountId: string;
    jmapAccountId: string;
    subject: string;
    from: string;
    html: string | null;
    text: string;
    attachments?: Attachment[];
    onArchive: () => void;
  } = $props();

  let allowImages = $state(false);
  let srcdoc = $derived(html ? buildSandboxedEmailDoc(html, allowImages) : '');
</script>

<div class="env-card flex h-full flex-col rounded-3xl border shadow-sm">
  <header class="env-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
    <div class="min-w-0">
      <h2 class="env-text truncate text-lg font-semibold">{subject || '(Sans objet)'}</h2>
      <p class="env-muted truncate text-sm">{from}</p>
    </div>
    <div class="flex items-center gap-2">
      {#if html && !allowImages}
        <button
          type="button"
          onclick={() => (allowImages = true)}
          class="env-input env-hover rounded-xl border px-3.5 py-2 text-xs font-medium"
        >
          Afficher les images
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

  {#if attachments.length > 0}
    <div class="env-subtle env-border flex flex-wrap gap-2 border-b px-6 py-3">
      {#each attachments as att}
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
        class="h-full w-full rounded-2xl border-0"
      ></iframe>
    {:else}
      <pre class="env-text whitespace-pre-wrap font-sans text-sm leading-relaxed">{text}</pre>
    {/if}
  </div>
</div>
