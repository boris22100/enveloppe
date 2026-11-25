<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  import { ROLE_META, type Mailbox } from '../../lib/jmap/client';
  import type { SieveActionType, SieveRule } from '../../lib/utils/sieveGenerator';

  let {
    rule = $bindable(),
    mailboxes = [],
    onSync,
    onRemoveRule,
    onAddCondition,
    onRemoveCondition,
    onAddAction,
    onRemoveAction,
    onActionTypeChange
  }: {
    rule: SieveRule;
    mailboxes?: Mailbox[];
    onSync: () => void;
    onRemoveRule: (id: string) => void;
    onAddCondition: (r: SieveRule) => void;
    onRemoveCondition: (r: SieveRule, condId: string) => void;
    onAddAction: (r: SieveRule) => void;
    onRemoveAction: (r: SieveRule, actId: string) => void;
    onActionTypeChange: (act: { type: SieveActionType; value: string }) => void;
  } = $props();
</script>

<div class="env-card space-y-4 rounded-xl border p-5 shadow-xs">
  <div class="env-border flex flex-wrap items-center justify-between gap-2 border-b pb-3.5">
    <div class="flex flex-wrap items-center gap-2.5">
      <input
        type="checkbox"
        bind:checked={rule.enabled}
        onchange={onSync}
        aria-label={t('sieve.toggleRuleAria', undefined, activeLocale)}
        class="h-4 w-4 accent-[#48B17F]"
      />
      <input
        bind:value={rule.name}
        oninput={onSync}
        aria-label={t('sieve.ruleName', undefined, activeLocale)}
        placeholder={t('sieve.ruleName', undefined, activeLocale)}
        class="env-input rounded-xl border px-3 py-1.5 text-xs font-semibold"
      />
      <select
        bind:value={rule.matchType}
        onchange={onSync}
        aria-label={t('sieve.conditionLogicAria', undefined, activeLocale)}
        class="env-input rounded-xl border px-3 py-1.5 text-xs"
      >
        <option value="allof">{t('sieve.allConditions', undefined, activeLocale)}</option>
        <option value="anyof">{t('sieve.anyConditions', undefined, activeLocale)}</option>
      </select>
    </div>

    <button
      type="button"
      onclick={() => onRemoveRule(rule.id)}
      class="env-muted rounded-xl px-2.5 py-1.5 text-xs hover:bg-red-500/15 hover:text-red-400"
    >
      🗑️ Supprimer
    </button>
  </div>

  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wider text-sky-400">Conditions</span>
      <button type="button" onclick={() => onAddCondition(rule)} class="env-muted env-accent-text text-xs font-medium">+ Condition</button>
    </div>

    {#each rule.conditions as cond}
      <div class="flex flex-wrap items-center gap-2">
        <select
          bind:value={cond.field}
          onchange={onSync}
          aria-label={t('sieve.fieldAria', undefined, activeLocale)}
          class="env-input rounded-xl border px-3 py-2 text-xs"
        >
          <option value="from">De (From)</option>
          <option value="to">{t('sieve.toCcHeader', undefined, activeLocale)}</option>
          <option value="subject">Objet (Subject)</option>
          <option value="header">{t('sieve.customHeader', undefined, activeLocale)}</option>
          <option value="size">{t('sieve.messageSize', undefined, activeLocale)}</option>
        </select>

        {#if cond.field === 'header'}
          <input
            bind:value={cond.headerName}
            oninput={onSync}
            aria-label="Nom de l'en-tête"
            placeholder="Ex: List-Id"
            class="env-input w-36 rounded-xl border px-3 py-2 text-xs"
          />
        {/if}

        {#if cond.field === 'size'}
          <select
            bind:value={cond.operator}
            onchange={onSync}
            aria-label={t('sieve.sizeComparatorAria', undefined, activeLocale)}
            class="env-input rounded-xl border px-3 py-2 text-xs"
          >
            <option value="over">{t('sieve.over', undefined, activeLocale)}</option>
            <option value="under">{t('sieve.under', undefined, activeLocale)}</option>
          </select>
          <input
            bind:value={cond.value}
            oninput={onSync}
            aria-label={t('sieve.sizeValueAria', undefined, activeLocale)}
            placeholder="Ex: 5M ou 500K"
            class="env-input min-w-44 flex-1 rounded-xl border px-3.5 py-2 text-xs"
          />
        {:else}
          <select
            bind:value={cond.operator}
            onchange={onSync}
            aria-label={t('sieve.operatorAria', undefined, activeLocale)}
            class="env-input rounded-xl border px-3 py-2 text-xs"
          >
            <option value="contains">contient</option>
            <option value="is">{t('sieve.exactMatch', undefined, activeLocale)}</option>
            <option value="matches">{t('sieve.matches', undefined, activeLocale)}</option>
          </select>
          <input
            bind:value={cond.value}
            oninput={onSync}
            aria-label={t('sieve.conditionValueAria', undefined, activeLocale)}
            placeholder={cond.field === 'from' ? t('sieve.emailPlaceholder', undefined, activeLocale) : t('sieve.searchTextPlaceholder', undefined, activeLocale)}
            class="env-input min-w-48 flex-1 rounded-xl border px-3.5 py-2 text-xs"
          />
        {/if}

        {#if rule.conditions.length > 1}
          <button
            type="button"
            onclick={() => onRemoveCondition(rule, cond.id)}
            aria-label={t('sieve.deleteConditionAria', undefined, activeLocale)}
            class="env-faint rounded-xl px-2 py-1.5 text-xs hover:text-red-400"
          >
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="space-y-2 pt-1">
    <div class="flex items-center justify-between">
      <span class="env-accent-text text-xs font-semibold uppercase tracking-wider">Actions</span>
      <button type="button" onclick={() => onAddAction(rule)} class="env-muted env-accent-text text-xs font-medium">+ Action</button>
    </div>

    {#each rule.actions as act}
      <div class="flex flex-wrap items-center gap-2">
        <select
          bind:value={act.type}
          onchange={() => onActionTypeChange(act)}
          aria-label="Type d'action"
          class="env-input rounded-xl border px-3 py-2 text-xs"
        >
          <option value="fileinto">📁 {t('sieve.moveToFolder', undefined, activeLocale)}</option>
          <option value="markRead">📭 {t('sieve.markAsReadAction', undefined, activeLocale)}</option>
          <option value="star">★ {t('sieve.flagAction', undefined, activeLocale)}</option>
          <option value="redirect">↪️ {t('sieve.redirectTo', undefined, activeLocale)}</option>
          <option value="reject">🚫 {t('sieve.rejectAction', undefined, activeLocale)}</option>
          <option value="stop">🛑 {t('sieve.stopProcessing', undefined, activeLocale)}</option>
        </select>

        {#if act.type === 'fileinto'}
          <select
            bind:value={act.value}
            onchange={onSync}
            aria-label={t('sieve.destinationFolderAria', undefined, activeLocale)}
            class="env-input min-w-48 flex-1 rounded-xl border px-3 py-2 text-xs"
          >
            {#each mailboxes as box}
              <option value={box.name}>
                {'— '.repeat(box.depth ?? 0)}{(box.role && ROLE_META[box.role]?.label) || box.name}
              </option>
            {/each}
            {#if act.value && !mailboxes.some((b) => b.name === act.value)}
              <option value={act.value}>{act.value}</option>
            {/if}
          </select>
        {:else if act.type === 'redirect'}
          <input
            type="email"
            bind:value={act.value}
            oninput={onSync}
            aria-label={t('sieve.redirectAddressAria', undefined, activeLocale)}
            placeholder="destinataire@domaine.fr"
            class="env-input min-w-48 flex-1 rounded-xl border px-3.5 py-2 text-xs"
          />
        {:else if act.type === 'reject'}
          <input
            bind:value={act.value}
            oninput={onSync}
            aria-label={t('sieve.rejectReasonAria', undefined, activeLocale)}
            placeholder={t('sieve.rejectReasonPlaceholder', undefined, activeLocale)}
            class="env-input min-w-48 flex-1 rounded-xl border px-3.5 py-2 text-xs"
          />
        {/if}

        {#if rule.actions.length > 1}
          <button
            type="button"
            onclick={() => onRemoveAction(rule, act.id)}
            aria-label={t('sieve.deleteAction', undefined, activeLocale)}
            class="env-faint rounded-xl px-2 py-1.5 text-xs hover:text-red-400"
          >
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>
