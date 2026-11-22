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

<div class="flex h-full flex-col bg-[#0E1C2B]">
  <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
    <div class="min-w-0">
      <h2 class="truncate text-lg font-semibold text-white">{subject || '(Sans objet)'}</h2>
      <p class="truncate text-sm text-slate-400">{from}</p>
    </div>
    <div class="flex items-center gap-2">
      {#if html && !allowImages}
        <button onclick={() => (allowImages = true)} class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-[#48B17F]">
          Afficher les images
        </button>
      {/if}
      <button onclick={onArchive} class="rounded-lg bg-[#48B17F]/15 px-3 py-1.5 text-xs font-medium text-[#48B17F] hover:bg-[#48B17F]/25">
        Archiver (E)
      </button>
    </div>
  </header>

  {#if attachments.length > 0}
    <div class="flex flex-wrap gap-2 border-b border-slate-800/80 bg-[#0B1622] px-6 py-2.5">
      {#each attachments as att}
        <a
          href={getDownloadUrl(accountId, jmapAccountId, att)}
          download={att.name}
          class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-[#48B17F]"
        >
          <span>📎 {att.name || 'fichier'}</span>
          <span class="text-slate-500">({Math.max(1, Math.round(att.size / 1024))} Ko)</span>
        </a>
      {/each}
    </div>
  {/if}

  <div class="flex-1 overflow-hidden p-6">
    {#if html}
      <iframe title="Contenu" sandbox="allow-popups allow-popups-to-escape-sandbox" {srcdoc} class="h-full w-full border-0"></iframe>
    {:else}
      <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">{text}</pre>
    {/if}
  </div>
</div>
