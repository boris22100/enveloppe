<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  import { onMount, tick } from 'svelte';
  import type { Mailbox } from '../lib/jmap/client';

  let {
    x,
    y,
    type,
    mail,
    mailbox,
    mailboxes = [],
    onClose,
    onAction
  }: {
    x: number;
    y: number;
    type: 'mail' | 'mailbox';
    mail?: any;
    mailbox?: Mailbox;
    mailboxes?: Mailbox[];
    onClose: () => void;
    onAction: (action: string, payload?: any) => void;
  } = $props();

  let menuEl = $state<HTMLDivElement | null>(null);
  let moveBtnEl = $state<HTMLButtonElement | null>(null);
  let subMenuEl = $state<HTMLDivElement | null>(null);

  let showMoveSub = $state(false);
  let showMoreSub = $state(false);
  let overridePos = $state<{ left: number; top: number } | null>(null);
  let pos = $derived(overridePos ?? { left: x, top: y });
  let subPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });

  const ROLE_LABELS: Record<string, { label: string; icon: string }> = {
    inbox: { label: 'Boîte de réception', icon: '📥' },
    drafts: { label: 'Brouillons', icon: '📝' },
    sent: { label: 'Envoyés', icon: '📤' },
    archive: { label: 'Archives', icon: '📦' },
    junk: { label: 'Indésirables', icon: '🚫' },
    trash: { label: 'Corbeille', icon: '🗑️' }
  };

  function boxLabel(b: Mailbox) {
    return (b.role && ROLE_LABELS[b.role]?.label) || b.name;
  }

  function boxIcon(b: Mailbox) {
    return b.depth ? '📁' : (b.role && ROLE_LABELS[b.role]?.icon) || '📁';
  }

  function clampMenu() {
    if (!menuEl || typeof window === 'undefined') return;
    const rect = menuEl.getBoundingClientRect();
    const pad = 12;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    overridePos = { left, top };
  }

  async function positionMoveSubmenu() {
    await tick();
    if (!moveBtnEl || typeof window === 'undefined') return;
    const btnRect = moveBtnEl.getBoundingClientRect();
    const subW = subMenuEl?.getBoundingClientRect().width || 220;
    const subH = subMenuEl?.getBoundingClientRect().height || Math.min(340, Math.max(120, mailboxes.length * 36 + 16));
    const pad = 12;
    const gap = 6;

    let left = btnRect.right + gap;
    if (left + subW > window.innerWidth - pad) {
      left = Math.max(pad, btnRect.left - subW - gap);
    }

    let top = btnRect.top;
    if (top + subH > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - subH - pad);
    }

    subPos = { left, top };
  }

  function toggleMoveSub(e: MouseEvent) {
    e.stopPropagation();
    showMoreSub = false;
    showMoveSub = !showMoveSub;
    if (showMoveSub) positionMoveSubmenu();
  }

  function openMoveSubOnHover() {
    showMoreSub = false;
    showMoveSub = true;
    positionMoveSubmenu();
  }

  onMount(async () => {
    await tick();
    clampMenu();
  });

  function pick(action: string, payload?: any) {
    onAction(action, payload);
    onClose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} onresize={clampMenu} />

<div
  role="presentation"
  onclick={onClose}
  oncontextmenu={(e) => { e.preventDefault(); onClose(); }}
  class="fixed inset-0 z-40"
>
  <div
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    style="left: {pos.left}px; top: {pos.top}px;"
    class="env-card fixed z-50 w-56 rounded-xl border py-1.5 text-sm shadow-2xl"
  >
    {#if type === 'mail' && mail}
      <button type="button" onclick={() => pick('archive')} class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left">
        <span>📦 Archiver</span>
        <kbd class="env-faint text-xs">E</kbd>
      </button>
      <button type="button" onclick={() => pick('delete')} class="flex w-full items-center justify-between px-3.5 py-2 text-left text-red-400 hover:bg-red-500/10">
        <span>🗑️ {t('common.delete', undefined, activeLocale)}</span>
        <kbd class="env-faint text-xs">Suppr</kbd>
      </button>
      <button type="button" onclick={() => pick('toggleRead')} class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left">
        <span>{mail.isUnread ? `✉️ ${t('mail.markRead', undefined, activeLocale)}` : `📩 ${t('mail.markUnread', undefined, activeLocale)}`}</span>
      </button>

      <div class="env-border my-1 border-t"></div>

      <div role="none" class="relative" onmouseenter={openMoveSubOnHover}>
        <button
          bind:this={moveBtnEl}
          type="button"
          aria-expanded={showMoveSub}
          onclick={toggleMoveSub}
          class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left"
        >
          <span>📁 {t('mail.moveTo', undefined, activeLocale)}</span>
          <span class="env-faint text-xs">›</span>
        </button>
      </div>

      <button type="button" onclick={() => pick('toggleStar')} class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left">
        <span>{mail.keywords?.['$flagged'] ? `★ ${t('mail.starRemove', undefined, activeLocale)}` : `☆ ${t('mail.starAdd', undefined, activeLocale)}`}</span>
      </button>
      <button type="button" onclick={() => pick('spam')} class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left text-amber-400">
        <span>🚫 {t('mail.reportJunk', undefined, activeLocale)}</span>
      </button>

      <div class="env-border my-1 border-t"></div>

      <div role="none" class="relative" onmouseenter={() => { showMoveSub = false; showMoreSub = true; }}>
        <button type="button" onclick={() => { showMoveSub = false; showMoreSub = !showMoreSub; }} class="env-hover flex w-full items-center justify-between px-3.5 py-2 text-left">
          <span>⋯ Plus d'actions</span>
          <span class="env-faint text-xs">›</span>
        </button>
        {#if showMoreSub}
          <div role="menu" class="env-card fixed z-50 w-52 rounded-xl border py-1.5 shadow-2xl" style="left: {Math.min(pos.left + 228, window.innerWidth - 224)}px; top: {Math.min(pos.top + 170, window.innerHeight - 140)}px;">
            <button type="button" onclick={() => pick('downloadEml')} class="env-hover flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs">💾 {t('mail.downloadEml', undefined, activeLocale)}</button>
            <button type="button" onclick={() => pick('print')} class="env-hover flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs">🖨️ Imprimer</button>
            <button type="button" onclick={() => pick('createFilter')} class="env-hover flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs">⚡ {t('mail.createFilterHere', undefined, activeLocale)}</button>
          </div>
        {/if}
      </div>
    {:else if type === 'mailbox' && mailbox}
      <button type="button" onclick={() => pick('markRead')} class="env-hover flex w-full items-center gap-2.5 px-3.5 py-2 text-left">
        <span>✓</span><span>{t('mail.markAllRead', undefined, activeLocale)}</span>
      </button>
      {#if mailbox.role === 'junk'}
        <button type="button" onclick={() => pick('emptyJunk')} class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-400 hover:bg-red-500/10">
          <span>🗑️</span><span>{t('mail.deleteAllJunk', undefined, activeLocale)}</span>
        </button>
      {/if}
      {#if mailbox.role === 'trash'}
        <button type="button" onclick={() => pick('emptyTrash')} class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-400 hover:bg-red-500/10">
          <span>🗑️</span><span>{t('mail.emptyTrash', undefined, activeLocale)}</span>
        </button>
      {/if}
      <div class="env-border my-1 border-t"></div>
      <button type="button" onclick={() => pick('newSubfolder')} class="env-hover flex w-full items-center gap-2.5 px-3.5 py-2 text-left">
        <span>📁</span><span>{t('mail.newSubfolder', undefined, activeLocale)}</span>
      </button>
      {#if !mailbox.role}
        <button type="button" onclick={() => pick('renameFolder')} class="env-hover flex w-full items-center gap-2.5 px-3.5 py-2 text-left">
          <span>✏️</span><span>Renommer</span>
        </button>
        <button type="button" onclick={() => pick('deleteFolder')} class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-400 hover:bg-red-500/10">
          <span>🗑️</span><span>{t('mail.deleteFolder', undefined, activeLocale)}</span>
        </button>
      {/if}
    {/if}
  </div>

  {#if type === 'mail' && mail && showMoveSub}
    <div
      bind:this={subMenuEl}
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (showMoveSub = false)}
      style="left: {subPos.left}px; top: {subPos.top}px;"
      class="env-card fixed z-50 max-h-80 w-56 overflow-y-auto rounded-xl border py-1.5 shadow-2xl"
    >
      {#each mailboxes as b}
        <button
          type="button"
          onclick={() => pick('move', b.id)}
          style="padding-left: {14 + (b.depth ?? 0) * 12}px"
          class="env-hover flex w-full items-center gap-2 pr-3.5 py-1.5 text-left text-xs"
        >
          <span>{boxIcon(b)}</span>
          <span class="truncate">{boxLabel(b)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
