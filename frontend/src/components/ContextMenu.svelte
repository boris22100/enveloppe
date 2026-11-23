<script lang="ts">
  import { ROLE_META, type Mailbox } from '../lib/jmap/client';
  import type { CachedEmail } from '../lib/db/cache';

  let {
    x = 0,
    y = 0,
    type,
    mail = null,
    mailbox = null,
    mailboxes = [],
    onClose,
    onAction
  }: {
    x: number;
    y: number;
    type: 'mail' | 'mailbox';
    mail?: CachedEmail | null;
    mailbox?: Mailbox | null;
    mailboxes?: Mailbox[];
    onClose: () => void;
    onAction: (action: string, payload?: any) => void;
  } = $props();

  let subMenu = $state<'move' | 'more' | null>(null);

  let posX = $derived(typeof window !== 'undefined' ? Math.min(x, window.innerWidth - 250) : x);
  let posY = $derived(typeof window !== 'undefined' ? Math.min(y, window.innerHeight - 360) : y);

  let isUnread = $derived(mail ? (mail.keywords ? !mail.keywords['$seen'] : mail.isUnread) : false);
  let isStarred = $derived(mail ? !!mail.keywords?.['$flagged'] : false);

  function trigger(action: string, payload?: any) {
    onAction(action, payload);
    onClose();
  }
</script>

<svelte:window onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
  role="menu"
  tabindex="-1"
  onclick={(e) => e.stopPropagation()}
  oncontextmenu={(e) => e.preventDefault()}
  style="left: {posX}px; top: {posY}px;"
  class="fixed z-50 w-60 rounded-xl border border-slate-700/90 bg-[#0D1B2A] py-1.5 text-xs text-slate-200 shadow-2xl backdrop-blur"
>
  {#if type === 'mail' && mail}
    <button onclick={() => trigger('archive')} class="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-800/80">
      <span>🗄️ Archiver</span><kbd class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">E</kbd>
    </button>
    <button onclick={() => trigger('delete')} class="flex w-full items-center justify-between px-3 py-2 text-red-300 hover:bg-red-500/15">
      <span>🗑️ Supprimer</span><kbd class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Suppr</kbd>
    </button>
    <button onclick={() => trigger('toggleRead')} class="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-800/80">
      <span>{isUnread ? '📭 Marquer comme lu' : '✉️ Marquer comme non lu'}</span>
      <kbd class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">U</kbd>
    </button>

    <div class="my-1 border-t border-slate-800"></div>

    <!-- Sous-menu Déplacer vers -->
    <div class="relative" onmouseenter={() => (subMenu = 'move')} onmouseleave={() => (subMenu = null)}>
      <button class="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-800/80">
        <span>📁 Déplacer vers</span><span class="text-slate-400">›</span>
      </button>
      {#if subMenu === 'move'}
        <div class="absolute left-full top-0 ml-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-700 bg-[#0D1B2A] py-1 shadow-2xl">
          {#each mailboxes as box}
            <button
              onclick={() => trigger('move', box.id)}
              class="flex w-full items-center gap-2 truncate px-3 py-1.5 text-left hover:bg-slate-800/80"
              style="padding-left: {12 + (box.depth ?? 0) * 10}px"
            >
              <span>{(box.role && ROLE_META[box.role]?.icon) || '📁'}</span>
              <span class="truncate">{(box.role && ROLE_META[box.role]?.label) || box.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button onclick={() => trigger('toggleStar')} class="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-800/80">
      <span>{isStarred ? '★ Retirer des favoris' : '☆ Marquer comme favori'}</span>
      <kbd class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">S</kbd>
    </button>
    <button onclick={() => trigger('spam')} class="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-800/80">
      <span>🚫 Signaler comme indésirable</span><kbd class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">!</kbd>
    </button>

    <div class="my-1 border-t border-slate-800"></div>

    <!-- Sous-menu Plus d'actions -->
    <div class="relative" onmouseenter={() => (subMenu = 'more')} onmouseleave={() => (subMenu = null)}>
      <button class="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-800/80">
        <span>⋯ Plus d'actions</span><span class="text-slate-400">›</span>
      </button>
      {#if subMenu === 'more'}
        <div class="absolute left-full bottom-0 ml-1 w-48 rounded-xl border border-slate-700 bg-[#0D1B2A] py-1 shadow-2xl">
          <button onclick={() => trigger('downloadEml')} class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/80">
            <span>⬇️ Exporter en .eml</span>
          </button>
          <button onclick={() => trigger('print')} class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/80">
            <span>🖨️ Imprimer</span>
          </button>
          <button onclick={() => trigger('createFilter')} class="flex w-full items-center gap-2 px-3 py-2 text-left text-[#48B17F] hover:bg-slate-800/80">
            <span>⚡ Créer un filtre</span>
          </button>
        </div>
      {/if}
    </div>

  {:else if type === 'mailbox' && mailbox}
    <button onclick={() => trigger('markRead')} class="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-800/80">
      <span>📭 Marquer comme lu(s)</span>
    </button>

    {#if mailbox.role === 'junk'}
      <button onclick={() => trigger('emptyJunk')} class="flex w-full items-center gap-2 px-3 py-2 text-red-300 hover:bg-red-500/15">
        <span>🗑️ Supprimer les indésirables</span>
      </button>
    {:else if mailbox.role === 'trash'}
      <button onclick={() => trigger('emptyTrash')} class="flex w-full items-center gap-2 px-3 py-2 text-red-300 hover:bg-red-500/15">
        <span>🔥 Vider la corbeille</span>
      </button>
    {/if}

    <div class="my-1 border-t border-slate-800"></div>

    <button onclick={() => trigger('newSubfolder')} class="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-800/80">
      <span>📁+ Nouveau sous-dossier</span>
    </button>

    {#if !mailbox.role}
      <button onclick={() => trigger('renameFolder')} class="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-800/80">
        <span>✏️ Renommer</span>
      </button>
      <div class="my-1 border-t border-slate-800"></div>
      <button onclick={() => trigger('deleteFolder')} class="flex w-full items-center gap-2 px-3 py-2 text-red-300 hover:bg-red-500/15">
        <span>🗑️ Supprimer le dossier</span>
      </button>
    {/if}
  {/if}
</div>
