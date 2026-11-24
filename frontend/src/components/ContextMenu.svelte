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

  let posX = $derived(typeof window !== 'undefined' ? Math.min(x, window.innerWidth - 270) : x);
  let posY = $derived(typeof window !== 'undefined' ? Math.min(y, window.innerHeight - 380) : y);

  let isUnread = $derived(mail ? (mail.keywords ? !mail.keywords['$seen'] : mail.isUnread) : false);
  let isStarred = $derived(mail ? !!mail.keywords?.['$flagged'] : false);

  function trigger(action: string, payload?: any) {
    onAction(action, payload);
    onClose();
  }
</script>

<svelte:window onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div role="presentation" onclick={(e) => e.stopPropagation()}>
  <div
    role="menu"
    tabindex="-1"
    oncontextmenu={(e) => e.preventDefault()}
    style="left: {posX}px; top: {posY}px;"
    class="env-card fixed z-50 w-64 rounded-lg border py-2 text-sm shadow-2xl backdrop-blur"
  >
    {#if type === 'mail' && mail}
      <button type="button" onclick={() => trigger('archive')} class="env-text env-hover flex w-full items-center justify-between px-4 py-2.5">
        <span>🗄️ Archiver</span><kbd class="env-subtle env-faint rounded-md px-2 py-0.5 text-xs">E</kbd>
      </button>
      <button type="button" onclick={() => trigger('delete')} class="env-hover flex w-full items-center justify-between px-4 py-2.5 text-red-400">
        <span>🗑️ Supprimer</span><kbd class="env-subtle env-faint rounded-md px-2 py-0.5 text-xs">Suppr</kbd>
      </button>
      <button type="button" onclick={() => trigger('toggleRead')} class="env-text env-hover flex w-full items-center justify-between px-4 py-2.5">
        <span>{isUnread ? '📭 Marquer comme lu' : '✉️ Marquer comme non lu'}</span>
      </button>

      <div class="env-border my-1.5 border-t"></div>

      <div role="none" class="relative" onmouseenter={() => (subMenu = 'move')} onmouseleave={() => (subMenu = null)}>
        <button type="button" onclick={() => (subMenu = subMenu === 'move' ? null : 'move')} class="env-text env-hover flex w-full items-center justify-between px-4 py-2.5">
          <span>📁 Déplacer vers</span><span class="env-faint">›</span>
        </button>
        {#if subMenu === 'move'}
          <div role="menu" tabindex="-1" class="env-card fixed max-h-64 w-56 overflow-y-auto rounded-lg border py-1.5 shadow-2xl" style="left: {Math.min(posX + 252, typeof window !== 'undefined' ? window.innerWidth - 236 : posX + 252)}px; top: {posY}px;">
            {#each mailboxes as box}
              <button
                type="button"
                onclick={() => trigger('move', box.id)}
                class="env-text env-hover flex w-full items-center gap-2 truncate px-3.5 py-2 text-left text-xs"
                style="padding-left: {14 + (box.depth ?? 0) * 12}px"
              >
                <span>{(box.role && ROLE_META[box.role]?.icon) || '📁'}</span>
                <span class="truncate">{(box.role && ROLE_META[box.role]?.label) || box.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button type="button" onclick={() => trigger('toggleStar')} class="env-text env-hover flex w-full items-center justify-between px-4 py-2.5">
        <span>{isStarred ? '★ Retirer des favoris' : '☆ Marquer comme favori'}</span>
      </button>
      <button type="button" onclick={() => trigger('spam')} class="env-text env-hover flex w-full items-center justify-between px-4 py-2.5">
        <span>🚫 Signaler comme indésirable</span>
      </button>

      <div class="env-border my-1.5 border-t"></div>

      <div role="none" class="relative" onmouseenter={() => (subMenu = 'more')} onmouseleave={() => (subMenu = null)}>
        <button type="button" onclick={() => (subMenu = subMenu === 'more' ? null : 'more')} class="env-text env-hover flex w-full items-center justify-between px-4 py-2.5">
          <span>⋯ Plus d'actions</span><span class="env-faint">›</span>
        </button>
        {#if subMenu === 'more'}
          <div role="menu" tabindex="-1" class="env-card fixed w-52 rounded-lg border py-1.5 shadow-2xl" style="left: {Math.min(posX + 252, typeof window !== 'undefined' ? window.innerWidth - 216 : posX + 252)}px; top: {posY + 90}px;">
            <button type="button" onclick={() => trigger('downloadEml')} class="env-text env-hover flex w-full items-center gap-2 px-4 py-2 text-left text-xs">
              <span>⬇️ Exporter en .eml</span>
            </button>
            <button type="button" onclick={() => trigger('print')} class="env-text env-hover flex w-full items-center gap-2 px-4 py-2 text-left text-xs">
              <span>🖨️ Imprimer</span>
            </button>
            <button type="button" onclick={() => trigger('createFilter')} class="env-accent-text env-hover flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold">
              <span>⚡ Créer un filtre</span>
            </button>
          </div>
        {/if}
      </div>

    {:else if type === 'mailbox' && mailbox}
      <button type="button" onclick={() => trigger('markRead')} class="env-text env-hover flex w-full items-center gap-2.5 px-4 py-2.5 text-left">
        <span>📭 Marquer comme lu(s)</span>
      </button>

      {#if mailbox.role === 'junk'}
        <button type="button" onclick={() => trigger('emptyJunk')} class="env-hover flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-red-400">
          <span>🗑️ Supprimer les indésirables</span>
        </button>
      {:else if mailbox.role === 'trash'}
        <button type="button" onclick={() => trigger('emptyTrash')} class="env-hover flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-red-400">
          <span>🔥 Vider la corbeille</span>
        </button>
      {/if}

      <div class="env-border my-1.5 border-t"></div>

      <button type="button" onclick={() => trigger('newSubfolder')} class="env-text env-hover flex w-full items-center gap-2.5 px-4 py-2.5 text-left">
        <span>📁+ Nouveau sous-dossier</span>
      </button>

      {#if !mailbox.role}
        <button type="button" onclick={() => trigger('renameFolder')} class="env-text env-hover flex w-full items-center gap-2.5 px-4 py-2.5 text-left">
          <span>✏️ Renommer</span>
        </button>
        <div class="env-border my-1.5 border-t"></div>
        <button type="button" onclick={() => trigger('deleteFolder')} class="env-hover flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-red-400">
          <span>🗑️ Supprimer le dossier</span>
        </button>
      {/if}
    {/if}
  </div>
</div>
