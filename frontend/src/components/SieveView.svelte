<script lang="ts">
  import { t } from '../lib/i18n';
  import SieveRuleCard from './sieve/SieveRuleCard.svelte';
  import SieveCodeEditor from './sieve/SieveCodeEditor.svelte';
  import SieveVacationCard from './sieve/SieveVacationCard.svelte';
  import SieveNewScriptModal from './sieve/SieveNewScriptModal.svelte';
  import SieveTemplatesBar, { type SieveTemplateEntry } from './sieve/SieveTemplatesBar.svelte';

  import { ROLE_META, type Mailbox } from '../lib/jmap/client';
  import {
    activateSieveScript,
    deleteSieveScript,
    fetchSieveScriptContent,
    fetchSieveScripts,
    saveSieveScript,
    validateSieveScript,
    type SieveScript
  } from '../lib/jmap/sieve';
  import {
    compileSieveScript,
    createEmptyRule,
    parseSieveToVisual,
    SIEVE_TEMPLATES,
    type SieveActionType,
    type SieveRule,
    type SieveVacation
  } from '../lib/utils/sieveGenerator';
  import ConfirmModal from './ConfirmModal.svelte';

  let {
    accountId,
    mailboxes = [],
    prefill = null,
    onPrefillConsumed
  }: {
    accountId: string;
    mailboxes?: Mailbox[];
    prefill?: { from?: string; subject?: string } | null;
    onPrefillConsumed?: () => void;
  } = $props();

  let scripts = $state<SieveScript[]>([]);
  let jmapAccountId = $state('');
  let selectedScriptId = $state<string | null>(null);
  let scriptName = $state('enveloppe');
  let isNewDraft = $state(false);

  let mode = $state<'visual' | 'code'>('visual');
  let rawCode = $state('');
  let rules = $state<SieveRule[]>([]);
  let vacation = $state<SieveVacation>({ enabled: false, days: 7, subject: 'Absence du bureau', reason: '' });
  let hasAdvancedCode = $state(false);

  let loading = $state(false);
  let saving = $state(false);
  let validating = $state(false);
  let banner = $state<{ type: 'ok' | 'err'; text: string } | null>(null);
  let scriptToDelete = $state<SieveScript | null>(null);
  let showNewModal = $state(false);
  let newScriptTitle = $state('');

  let selectedScript = $derived(scripts.find((s) => s.id === selectedScriptId) ?? null);

  function notify(type: 'ok' | 'err', text: string) {
    banner = { type, text };
    if (type === 'ok') {
      setTimeout(() => {
        if (banner?.text === text) banner = null;
      }, 4500);
    }
  }

  function applyCodeToVisual(code: string) {
    const parsed = parseSieveToVisual(code);
    rules = parsed.rules;
    vacation = parsed.vacation;
    hasAdvancedCode = parsed.hasAdvancedCode;
  }

  function syncVisualToCode() {
    rawCode = compileSieveScript(rules, vacation);
    hasAdvancedCode = false;
  }

  function switchMode(target: 'visual' | 'code') {
    if (target === mode) return;
    if (target === 'code') {
      if (!hasAdvancedCode && (rules.length > 0 || vacation.enabled)) {
        rawCode = compileSieveScript(rules, vacation);
      }
      mode = 'code';
    } else {
      applyCodeToVisual(rawCode);
      mode = 'visual';
    }
  }

  async function selectScript(script: SieveScript) {
    selectedScriptId = script.id;
    scriptName = script.name;
    isNewDraft = false;
    banner = null;
    try {
      const text = await fetchSieveScriptContent(accountId, jmapAccountId, script.blobId);
      rawCode = text;
      applyCodeToVisual(text);
    } catch (err: any) {
      notify('err', err.message);
    }
  }

  async function loadAll(preferredId?: string) {
    loading = true;
    banner = null;
    try {
      const res = await fetchSieveScripts(accountId);
      jmapAccountId = res.jmapAccountId;
      scripts = res.scripts;

      const target =
        (preferredId && scripts.find((s) => s.id === preferredId)) ||
        scripts.find((s) => s.isActive) ||
        scripts[0];

      if (target) {
        await selectScript(target);
      } else {
        selectedScriptId = null;
        scriptName = 'enveloppe';
        isNewDraft = true;
        rules = [createEmptyRule()];
        vacation = { enabled: false, days: 7, subject: 'Absence du bureau', reason: '' };
        rawCode = compileSieveScript(rules, vacation);
      }
    } catch (err: any) {
      notify('err', err.message || 'Impossible de charger les scripts Sieve.');
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (accountId) loadAll();
  });

  $effect(() => {
    if (prefill && !loading) {
      const defaultBox = mailboxes.find((m) => m.role === 'archive')?.name || mailboxes[0]?.name || 'Archives';
      const newRule = createEmptyRule({ ...prefill, defaultFolder: defaultBox });
      rules = [...rules, newRule];
      mode = 'visual';
      syncVisualToCode();
      notify('ok', 'Règle pré-remplie depuis le message. Pense à enregistrer.');
      onPrefillConsumed?.();
    }
  });

  function addRule() {
    const defaultBox = mailboxes.find((m) => m.role === 'archive')?.name || 'Archives';
    rules = [...rules, createEmptyRule({ defaultFolder: defaultBox })];
    syncVisualToCode();
  }

  function removeRule(id: string) {
    rules = rules.filter((r) => r.id !== id);
    syncVisualToCode();
  }

  function addCondition(rule: SieveRule) {
    rule.conditions = [
      ...rule.conditions,
      { id: Math.random().toString(36).slice(2, 9), field: 'subject', headerName: 'Subject', operator: 'contains', value: '' }
    ];
    syncVisualToCode();
  }

  function removeCondition(rule: SieveRule, condId: string) {
    if (rule.conditions.length <= 1) return;
    rule.conditions = rule.conditions.filter((c) => c.id !== condId);
    syncVisualToCode();
  }

  function addAction(rule: SieveRule) {
    rule.actions = [
      ...rule.actions,
      { id: Math.random().toString(36).slice(2, 9), type: 'markRead', value: '' }
    ];
    syncVisualToCode();
  }

  function removeAction(rule: SieveRule, actId: string) {
    if (rule.actions.length <= 1) return;
    rule.actions = rule.actions.filter((a) => a.id !== actId);
    syncVisualToCode();
  }

  function onActionTypeChange(act: { type: SieveActionType; value: string }) {
    if (act.type === 'fileinto' && !act.value) {
      act.value = mailboxes.find((m) => m.role === 'archive')?.name || 'Archives';
    } else if (act.type !== 'fileinto' && act.type !== 'redirect' && act.type !== 'reject') {
      act.value = '';
    }
    syncVisualToCode();
  }

  async function handleValidate() {
    const codeToTest = mode === 'visual' && !hasAdvancedCode ? compileSieveScript(rules, vacation) : rawCode;
    if (!codeToTest.trim()) {
      notify('err', 'Le script Sieve est vide.');
      return;
    }
    validating = true;
    banner = null;
    try {
      const res = await validateSieveScript(accountId, codeToTest);
      if (res.valid) {
        notify('ok', 'Syntaxe Sieve valide selon Stalwart.');
      } else {
        notify('err', 'Erreur Sieve : ' + (res.error || 'inconnue'));
      }
    } catch (err: any) {
      notify('err', err.message);
    } finally {
      validating = false;
    }
  }

  async function handleSave(activateAfter = false) {
    const codeToSave = mode === 'visual' && !hasAdvancedCode ? compileSieveScript(rules, vacation) : rawCode;
    if (!codeToSave.trim()) {
      notify('err', 'Ajoute au moins une règle ou du code Sieve avant de pousser sur le serveur.');
      return;
    }
    rawCode = codeToSave;
    saving = true;
    banner = null;
    try {
      const shouldActivate = activateAfter || isNewDraft || Boolean(selectedScript?.isActive);
      const savedId = await saveSieveScript(accountId, {
        id: isNewDraft ? undefined : selectedScriptId ?? undefined,
        name: scriptName.trim() || 'enveloppe',
        content: codeToSave,
        activate: shouldActivate
      });
      await loadAll(savedId);
      notify('ok', shouldActivate ? 'Script Sieve enregistré et activé sur Stalwart.' : 'Script Sieve enregistré sur Stalwart.');
    } catch (err: any) {
      notify('err', err.message);
    } finally {
      saving = false;
    }
  }

  async function handleToggleActive(script: SieveScript) {
    banner = null;
    try {
      await activateSieveScript(accountId, script.isActive ? null : script.id);
      await loadAll(script.id);
      notify('ok', script.isActive ? 'Script « ' + script.name + ' » désactivé.' : 'Script « ' + script.name + ' » activé.');
    } catch (err: any) {
      notify('err', err.message);
    }
  }

  async function handleCreateNewScript(e: Event) {
    e.preventDefault();
    const title = newScriptTitle.trim();
    if (!title) return;
    showNewModal = false;
    newScriptTitle = '';
    selectedScriptId = null;
    scriptName = title;
    isNewDraft = true;
    rules = [createEmptyRule()];
    vacation = { enabled: false, days: 7, subject: 'Absence du bureau', reason: '' };
    rawCode = compileSieveScript(rules, vacation);
    hasAdvancedCode = false;
    notify('ok', 'Brouillon « ' + title + ' » prêt. Clique sur « Enregistrer » pour le pousser sur Stalwart.');
  }

  async function confirmDeleteScript() {
    if (!scriptToDelete) return;
    const target = scriptToDelete;
    scriptToDelete = null;
    try {
      if (target.isActive) {
        await activateSieveScript(accountId, null);
      }
      await deleteSieveScript(accountId, target.id);
      await loadAll();
      notify('ok', 'Script « ' + target.name + ' » supprimé.');
    } catch (err: any) {
      notify('err', err.message);
    }
  }

  function handleEditorKeydown(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLTextAreaElement | null;
    if (e.key === 'Tab' && el) {
      e.preventDefault();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      rawCode = rawCode.slice(0, start) + '    ' + rawCode.slice(end);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
    }
  }

</script>

<div class="flex h-full overflow-hidden">
  <aside aria-label="Scripts Sieve" class="env-subtle env-border flex w-72 shrink-0 flex-col border-r p-4">
    <div class="mb-3.5 flex items-center justify-between">
      <span class="env-muted text-xs font-semibold uppercase tracking-wider">Scripts Sieve</span>
      <button
        type="button"
        onclick={() => (showNewModal = true)}
        class="env-accent-bg rounded-xl px-3 py-1.5 text-xs font-semibold hover:opacity-95"
      >
        {t('sieve.newScript')}
      </button>
    </div>

    <div class="flex-1 space-y-2 overflow-y-auto">
      {#each scripts as sc}
        <div
          class="group flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs transition-colors {selectedScriptId === sc.id && !isNewDraft ? 'env-active border-[var(--env-accent)]/50' : 'env-card env-hover'}"
        >
          <button type="button" onclick={() => selectScript(sc)} class="min-w-0 flex-1 text-left">
            <div class="env-text truncate text-sm font-semibold">{sc.name}</div>
            <div class="mt-1 flex items-center gap-1.5">
              {#if sc.isActive}
                <span class="env-accent-soft rounded-full px-2 py-0.5 text-[11px] font-semibold">● Actif</span>
              {:else}
                <span class="env-faint text-[11px]">Inactif</span>
              {/if}
            </div>
          </button>

          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title={sc.isActive ? 'Désactiver ce script' : 'Activer ce script'}
              aria-label={sc.isActive ? 'Désactiver ' + sc.name : 'Activer ' + sc.name}
              onclick={() => handleToggleActive(sc)}
              class="env-hover rounded-xl px-2 py-1.5 text-xs {sc.isActive ? 'env-accent-text' : 'env-muted'}"
            >
              {sc.isActive ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              title="Supprimer ce script"
              aria-label="Supprimer {sc.name}"
              onclick={() => (scriptToDelete = sc)}
              class="env-muted rounded-xl px-2 py-1.5 text-xs hover:bg-red-500/15 hover:text-red-400"
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}

      {#if isNewDraft}
        <div class="env-accent-soft rounded-lg border border-dashed border-[#48B17F]/60 px-3.5 py-2.5 text-xs">
          <div class="env-text text-sm font-semibold">{scriptName}</div>
          <div class="env-accent-text mt-0.5 text-[11px]">Non enregistré sur le serveur</div>
        </div>
      {/if}
    </div>

    <div class="env-card env-muted mt-3 rounded-lg border p-3.5 text-xs leading-relaxed">
      Un seul script Sieve peut être <span class="env-accent-text font-semibold">actif</span> à la fois sur Stalwart. Les règles sont exécutées côté serveur dès réception d'un message.
    </div>
  </aside>

  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="env-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
      <div class="flex flex-wrap items-center gap-3">
        <div>
          <h2 class="env-text text-lg font-bold">{t('sieve.title')}</h2>
          <p class="env-muted text-xs">Éditeur visuel & code Sieve synchronisé avec Stalwart</p>
        </div>

        <input
          bind:value={scriptName}
          aria-label="Nom du script Sieve"
          placeholder="Nom du script"
          class="env-input w-44 rounded-xl border px-3 py-2 text-xs font-medium"
        />

        <div class="env-subtle env-border flex rounded-xl border p-0.5 text-xs">
          <button
            type="button"
            onclick={() => switchMode('visual')}
            class="rounded-lg px-3 py-1.5 {mode === 'visual' ? 'env-accent-soft font-semibold' : 'env-muted'}"
          >
            🧩 {t('sieve.visualRules')}
          </button>
          <button
            type="button"
            onclick={() => switchMode('code')}
            class="rounded-lg px-3 py-1.5 {mode === 'code' ? 'env-accent-soft font-semibold' : 'env-muted'}"
          >
            &lt;/&gt; {t('sieve.sieveCode')}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={validating || loading}
          onclick={handleValidate}
          class="env-input env-hover rounded-xl border px-3.5 py-2 text-xs font-medium disabled:opacity-50"
        >
          {validating ? t('common.loading') : `✓ ${t('sieve.validateSyntax')}`}
        </button>

        {#if selectedScript && !selectedScript.isActive && !isNewDraft}
          <button
            type="button"
            disabled={saving}
            onclick={() => handleSave(true)}
            class="env-accent-soft rounded-xl border border-[#48B17F]/40 px-3.5 py-2 text-xs font-semibold hover:opacity-90"
          >
            💾 Enregistrer & Activer
          </button>
        {/if}

        <button
          type="button"
          disabled={saving || loading}
          onclick={() => handleSave(false)}
          class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold hover:opacity-95 disabled:opacity-50"
        >
          {saving ? t('common.loading') : `💾 ${t('sieve.saveToServer')}`}
        </button>
      </div>
    </header>

    {#if banner}
      <div role="status" class="border-b px-6 py-2.5 text-xs font-medium {banner.type === 'ok' ? 'env-accent-soft env-border' : 'border-red-500/30 bg-red-500/15 text-red-400'}">
        {banner.type === 'ok' ? '✅ ' : '⚠️ '}{banner.text}
      </div>
    {/if}

    {#if loading}
      <div class="env-muted flex flex-1 items-center justify-center text-sm">Chargement des scripts Sieve...</div>

    {:else if mode === 'visual'}
      <div class="flex-1 space-y-5 overflow-y-auto p-6">
        <div class="mx-auto max-w-4xl space-y-5">
          {#if hasAdvancedCode}
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-300">
              <span>Ce script contient des instructions Sieve avancées (<code>elsif</code>, <code>envelope</code>, <code>regex</code>...) non affichables en blocs. Utilise l'onglet <strong>Code Sieve</strong> pour éviter de les écraser.</span>
              <button
                type="button"
                onclick={() => switchMode('code')}
                class="rounded-xl bg-amber-400/20 px-3.5 py-2 font-semibold text-amber-200 hover:bg-amber-400/30"
              >
                Ouvrir le code Sieve
              </button>
            </div>
          {/if}

          <div class="flex items-center justify-between">
            <h3 class="env-text text-sm font-semibold">{t('sieve.rules')} ({rules.length})</h3>
            <button
              type="button"
              onclick={addRule}
              class="env-accent-soft rounded-xl border border-[#48B17F]/40 px-3.5 py-2 text-xs font-semibold hover:opacity-90"
            >
              {t('sieve.addRule')}
            </button>
          </div>

          {#each rules as _rule, idx (rules[idx].id)}
            <SieveRuleCard
              bind:rule={rules[idx]}
              {mailboxes}
              onSync={syncVisualToCode}
              onRemoveRule={removeRule}
              onAddCondition={addCondition}
              onRemoveCondition={removeCondition}
              onAddAction={addAction}
              onRemoveAction={removeAction}
              {onActionTypeChange}
            />
          {:else}
            <div class="env-card env-muted rounded-xl border border-dashed p-8 text-center text-xs">
              Aucune règle visuelle configurée. Clique sur <strong>+ Ajouter une règle</strong> ou utilise un modèle dans l'onglet <strong>Code Sieve</strong>.
            </div>
          {/each}

          <SieveVacationCard bind:vacation onChange={syncVisualToCode} />
        </div>
      </div>

    {:else}
      <div class="flex flex-1 flex-col overflow-hidden p-5">
        <SieveTemplatesBar
          templates={SIEVE_TEMPLATES}
          onApply={(tpl: SieveTemplateEntry) => {
            rawCode = rawCode.trim() ? rawCode.trim() + '\n\n' + tpl.code : tpl.code;
            applyCodeToVisual(rawCode);
          }}
        />

        <SieveCodeEditor bind:rawCode onKeydown={handleEditorKeydown} />
      </div>
    {/if}
  </div>
</div>

<SieveNewScriptModal
  open={showNewModal}
  bind:title={newScriptTitle}
  onSubmit={handleCreateNewScript}
  onClose={() => (showNewModal = false)}
/>

{#if scriptToDelete}
  <ConfirmModal
    title="Supprimer le script Sieve"
    message={'Voulez-vous vraiment supprimer le script « ' + scriptToDelete.name + ' » du serveur Stalwart ? Cette action est irréversible.'}
    confirmLabel="Supprimer le script"
    onConfirm={confirmDeleteScript}
    onCancel={() => (scriptToDelete = null)}
  />
{/if}
