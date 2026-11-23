<script lang="ts">
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
    highlightSieveCode,
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

  let preEl = $state<HTMLPreElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  let lineCount = $derived(Math.max(12, rawCode.split('\n').length));
  let highlightedHtml = $derived(highlightSieveCode(rawCode) + '\n');
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
    if (e.key === 'Tab' && textareaEl) {
      e.preventDefault();
      const start = textareaEl.selectionStart;
      const end = textareaEl.selectionEnd;
      rawCode = rawCode.slice(0, start) + '    ' + rawCode.slice(end);
      requestAnimationFrame(() => {
        if (textareaEl) textareaEl.selectionStart = textareaEl.selectionEnd = start + 4;
      });
    }
  }

  function syncScroll() {
    if (preEl && textareaEl) {
      preEl.scrollTop = textareaEl.scrollTop;
      preEl.scrollLeft = textareaEl.scrollLeft;
    }
  }
</script>

<div class="flex h-full overflow-hidden bg-[#0B1622]">
  <aside class="flex w-64 shrink-0 flex-col border-r border-slate-800/80 bg-[#0A131E] p-3">
    <div class="mb-3 flex items-center justify-between">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Scripts Sieve</span>
      <button
        type="button"
        onclick={() => (showNewModal = true)}
        class="rounded-lg bg-[#48B17F] px-2.5 py-1 text-xs font-semibold text-[#08101A] hover:opacity-90"
      >
        + Script
      </button>
    </div>

    <div class="flex-1 space-y-1.5 overflow-y-auto">
      {#each scripts as sc}
        <div
          class="group flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition-colors {selectedScriptId === sc.id && !isNewDraft ? 'border-[#48B17F]/50 bg-[#0D3A4D]/70 text-white' : 'border-slate-800/80 bg-slate-900/40 text-slate-300 hover:bg-slate-800/50'}"
        >
          <button type="button" onclick={() => selectScript(sc)} class="min-w-0 flex-1 text-left">
            <div class="flex items-center gap-1.5">
              <span class="truncate font-semibold">{sc.name}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5">
              {#if sc.isActive}
                <span class="rounded-full bg-[#48B17F]/20 px-1.5 py-0.2 text-[10px] font-semibold text-[#48B17F]">● Actif</span>
              {:else}
                <span class="text-[10px] text-slate-500">Inactif</span>
              {/if}
            </div>
          </button>

          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title={sc.isActive ? 'Désactiver ce script' : 'Activer ce script'}
              onclick={() => handleToggleActive(sc)}
              class="rounded px-1.5 py-1 text-[11px] {sc.isActive ? 'text-[#48B17F] hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-800 hover:text-[#48B17F]'}"
            >
              {sc.isActive ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              title="Supprimer ce script"
              onclick={() => (scriptToDelete = sc)}
              class="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-red-500/15 hover:text-red-400"
            >
              🗑️
            </button>
          </div>
        </div>
      {/each}

      {#if isNewDraft}
        <div class="rounded-xl border border-dashed border-[#48B17F]/60 bg-[#0D3A4D]/40 px-3 py-2 text-xs text-white">
          <div class="font-semibold">{scriptName}</div>
          <div class="text-[10px] text-[#48B17F]">Non enregistré sur le serveur</div>
        </div>
      {/if}
    </div>

    <div class="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[11px] leading-relaxed text-slate-400">
      Un seul script Sieve peut être <span class="font-semibold text-[#48B17F]">actif</span> à la fois sur Stalwart. Les règles sont exécutées côté serveur dès réception d'un message.
    </div>
  </aside>

  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
      <div class="flex flex-wrap items-center gap-3">
        <div>
          <h2 class="text-base font-bold text-white">Filtres serveur (Sieve)</h2>
          <p class="text-[11px] text-slate-400">Éditeur visuel & code Sieve synchronisé avec Stalwart</p>
        </div>

        <input
          bind:value={scriptName}
          aria-label="Nom du script Sieve"
          placeholder="Nom du script"
          class="w-40 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-white focus:border-[#48B17F] focus:outline-none"
        />

        <div class="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
          <button
            type="button"
            onclick={() => switchMode('visual')}
            class="rounded-md px-3 py-1 {mode === 'visual' ? 'bg-[#0D3A4D] font-semibold text-[#48B17F]' : 'text-slate-400 hover:text-white'}"
          >
            🧩 Règles visuelles
          </button>
          <button
            type="button"
            onclick={() => switchMode('code')}
            class="rounded-md px-3 py-1 {mode === 'code' ? 'bg-[#0D3A4D] font-semibold text-[#48B17F]' : 'text-slate-400 hover:text-white'}"
          >
            &lt;/&gt; Code Sieve
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={validating || loading}
          onclick={handleValidate}
          class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-[#48B17F] hover:text-white disabled:opacity-50"
        >
          {validating ? 'Vérification...' : '✓ Valider la syntaxe'}
        </button>

        {#if selectedScript && !selectedScript.isActive && !isNewDraft}
          <button
            type="button"
            disabled={saving}
            onclick={() => handleSave(true)}
            class="rounded-lg border border-[#48B17F]/50 bg-[#0D3A4D] px-3 py-1.5 text-xs font-semibold text-[#48B17F] hover:bg-[#114a62]"
          >
            💾 Enregistrer & Activer
          </button>
        {/if}

        <button
          type="button"
          disabled={saving || loading}
          onclick={() => handleSave(false)}
          class="rounded-lg bg-[#48B17F] px-3.5 py-1.5 text-xs font-semibold text-[#08101A] hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Envoi...' : '💾 Enregistrer sur Stalwart'}
        </button>
      </div>
    </header>

    {#if banner}
      <div class="border-b px-6 py-2 text-xs {banner.type === 'ok' ? 'border-[#48B17F]/30 bg-[#48B17F]/15 text-[#48B17F]' : 'border-red-500/30 bg-red-500/15 text-red-300'}">
        {banner.type === 'ok' ? '✅ ' : '⚠️ '}{banner.text}
      </div>
    {/if}

    {#if loading}
      <div class="flex flex-1 items-center justify-center text-xs text-slate-400">Chargement des scripts Sieve...</div>

    {:else if mode === 'visual'}
      <div class="flex-1 space-y-5 overflow-y-auto p-6">
        <div class="mx-auto max-w-4xl space-y-5">
          {#if hasAdvancedCode}
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
              <span>Ce script contient des instructions Sieve avancées (<code>elsif</code>, <code>envelope</code>, <code>regex</code>...) non affichables en blocs. Utilise l'onglet <strong>Code Sieve</strong> pour éviter de les écraser.</span>
              <button
                type="button"
                onclick={() => switchMode('code')}
                class="rounded-lg bg-amber-400/20 px-3 py-1.5 font-semibold text-amber-200 hover:bg-amber-400/30"
              >
                Ouvrir le code Sieve
              </button>
            </div>
          {/if}

          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">Règles de filtrage ({rules.length})</h3>
            <button
              type="button"
              onclick={addRule}
              class="rounded-lg bg-[#0D3A4D] px-3 py-1.5 text-xs font-semibold text-[#48B17F] ring-1 ring-[#48B17F]/40 hover:bg-[#114a62]"
            >
              + Ajouter une règle
            </button>
          </div>

          {#each rules as rule}
            <div class="space-y-4 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-5 shadow-lg">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div class="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    bind:checked={rule.enabled}
                    onchange={syncVisualToCode}
                    aria-label="Activer la règle"
                    class="h-4 w-4 accent-[#48B17F]"
                  />
                  <input
                    bind:value={rule.name}
                    oninput={syncVisualToCode}
                    aria-label="Nom de la règle"
                    placeholder="Nom de la règle"
                    class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white focus:border-[#48B17F] focus:outline-none"
                  />
                  <select
                    bind:value={rule.matchType}
                    onchange={syncVisualToCode}
                    aria-label="Logique des conditions"
                    class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300"
                  >
                    <option value="allof">Si TOUTES les conditions sont vraies</option>
                    <option value="anyof">Si AU MOINS UNE condition est vraie</option>
                  </select>
                </div>

                <button
                  type="button"
                  onclick={() => removeRule(rule.id)}
                  class="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-500/15 hover:text-red-400"
                >
                  🗑️ Supprimer
                </button>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-sky-400">Conditions</span>
                  <button type="button" onclick={() => addCondition(rule)} class="text-[11px] text-slate-400 hover:text-[#48B17F]">+ Condition</button>
                </div>

                {#each rule.conditions as cond}
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      bind:value={cond.field}
                      onchange={syncVisualToCode}
                      aria-label="Champ du message"
                      class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="from">De (From)</option>
                      <option value="to">À / Cc (To, Cc)</option>
                      <option value="subject">Objet (Subject)</option>
                      <option value="header">En-tête personnalisé</option>
                      <option value="size">Taille du message</option>
                    </select>

                    {#if cond.field === 'header'}
                      <input
                        bind:value={cond.headerName}
                        oninput={syncVisualToCode}
                        placeholder="Ex: List-Id"
                        class="w-32 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                      />
                    {/if}

                    {#if cond.field === 'size'}
                      <select
                        bind:value={cond.operator}
                        onchange={syncVisualToCode}
                        aria-label="Comparateur de taille"
                        class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300"
                      >
                        <option value="over">dépasse</option>
                        <option value="under">est inférieur à</option>
                      </select>
                      <input
                        bind:value={cond.value}
                        oninput={syncVisualToCode}
                        placeholder="Ex: 5M ou 500K"
                        class="min-w-44 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                      />
                    {:else}
                      <select
                        bind:value={cond.operator}
                        onchange={syncVisualToCode}
                        aria-label="Opérateur"
                        class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300"
                      >
                        <option value="contains">contient</option>
                        <option value="is">est exactement</option>
                        <option value="matches">correspond à (* ?)</option>
                      </select>
                      <input
                        bind:value={cond.value}
                        oninput={syncVisualToCode}
                        placeholder={cond.field === 'from' ? 'ex: newsletter@domaine.fr' : 'Texte à rechercher...'}
                        class="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                      />
                    {/if}

                    {#if rule.conditions.length > 1}
                      <button
                        type="button"
                        onclick={() => removeCondition(rule, cond.id)}
                        class="rounded px-2 py-1 text-xs text-slate-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="space-y-2 pt-1">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-[#48B17F]">Actions</span>
                  <button type="button" onclick={() => addAction(rule)} class="text-[11px] text-slate-400 hover:text-[#48B17F]">+ Action</button>
                </div>

                {#each rule.actions as act}
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      bind:value={act.type}
                      onchange={() => onActionTypeChange(act)}
                      aria-label="Type d'action"
                      class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="fileinto">📁 Déplacer vers le dossier</option>
                      <option value="markRead">📭 Marquer comme lu</option>
                      <option value="star">★ Ajouter aux favoris</option>
                      <option value="redirect">↪️ Transférer à l'adresse</option>
                      <option value="reject">🚫 Rejeter avec message</option>
                      <option value="stop">🛑 Arrêter les règles suivantes</option>
                    </select>

                    {#if act.type === 'fileinto'}
                      <select
                        bind:value={act.value}
                        onchange={syncVisualToCode}
                        aria-label="Dossier de destination"
                        class="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
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
                        oninput={syncVisualToCode}
                        placeholder="destinataire@domaine.fr"
                        class="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                      />
                    {:else if act.type === 'reject'}
                      <input
                        bind:value={act.value}
                        oninput={syncVisualToCode}
                        placeholder="Motif du rejet..."
                        class="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                      />
                    {/if}

                    {#if rule.actions.length > 1}
                      <button
                        type="button"
                        onclick={() => removeAction(rule, act.id)}
                        class="rounded px-2 py-1 text-xs text-slate-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
              Aucune règle visuelle configurée. Clique sur <strong>+ Ajouter une règle</strong> ou utilise un modèle dans l'onglet <strong>Code Sieve</strong>.
            </div>
          {/each}

          <div class="space-y-3 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <input
                  id="vac-toggle"
                  type="checkbox"
                  bind:checked={vacation.enabled}
                  onchange={syncVisualToCode}
                  class="h-4 w-4 accent-[#48B17F]"
                />
                <label for="vac-toggle" class="cursor-pointer text-sm font-semibold text-white">
                  🏖️ Répondeur automatique (Absence / Vacances)
                </label>
              </div>
              <span class="text-[11px] text-slate-400">Extension RFC 5230 <code>vacation</code></span>
            </div>

            {#if vacation.enabled}
              <div class="grid grid-cols-1 gap-3 pt-2 md:grid-cols-4">
                <div>
                  <label for="vac-days" class="mb-1 block text-[11px] text-slate-400">Fréquence (jours)</label>
                  <input
                    id="vac-days"
                    type="number"
                    min="1"
                    max="60"
                    bind:value={vacation.days}
                    oninput={syncVisualToCode}
                    class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div class="md:col-span-3">
                  <label for="vac-subj" class="mb-1 block text-[11px] text-slate-400">Objet de la réponse</label>
                  <input
                    id="vac-subj"
                    bind:value={vacation.subject}
                    oninput={syncVisualToCode}
                    placeholder="Absence du bureau"
                    class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div class="md:col-span-4">
                  <label for="vac-body" class="mb-1 block text-[11px] text-slate-400">Message envoyé automatiquement</label>
                  <textarea
                    id="vac-body"
                    rows="3"
                    bind:value={vacation.reason}
                    oninput={syncVisualToCode}
                    placeholder="Bonjour, je suis actuellement absent..."
                    class="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                  ></textarea>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

    {:else}
      <div class="flex flex-1 flex-col overflow-hidden p-5">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Modèles :</span>
          {#each SIEVE_TEMPLATES as tpl}
            <button
              type="button"
              title={tpl.description}
              onclick={() => {
                rawCode = rawCode.trim() ? rawCode.trim() + '\n\n' + tpl.code : tpl.code;
                applyCodeToVisual(rawCode);
              }}
              class="rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-xs text-slate-300 hover:border-[#48B17F] hover:text-[#48B17F]"
            >
              {tpl.label}
            </button>
          {/each}
        </div>

        <div class="relative flex flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-[#08101A] font-mono text-xs shadow-inner">
          <div
            aria-hidden="true"
            class="select-none border-r border-slate-800/80 bg-[#0A131E] px-3 py-4 text-right leading-6 text-slate-600"
          >
            {#each Array.from({ length: lineCount }, (_, i) => i + 1) as n}
              <div>{n}</div>
            {/each}
          </div>

          <div class="relative flex-1 overflow-hidden">
            <pre
              bind:this={preEl}
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6 text-slate-200"
            >{@html highlightedHtml}</pre>

            <textarea
              bind:this={textareaEl}
              bind:value={rawCode}
              onscroll={syncScroll}
              onkeydown={handleEditorKeydown}
              spellcheck="false"
              aria-label="Éditeur de code Sieve"
              placeholder={'require ["fileinto"];\n\nif header :contains "From" "exemple@domaine.fr" {\n    fileinto "Archives";\n}'}
              class="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-xs leading-6 text-transparent caret-[#48B17F] selection:bg-[#48B17F]/30 focus:outline-none"
            ></textarea>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showNewModal}
  <div
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={() => (showNewModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showNewModal = false)}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
  >
    <div
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      class="w-full max-w-sm"
    >
      <form
        onsubmit={handleCreateNewScript}
        class="space-y-4 rounded-2xl border border-slate-800 bg-[#0D1B2A] p-6 shadow-2xl"
      >
        <h3 class="text-base font-semibold text-white">Nouveau script Sieve</h3>
        <input
          bind:value={newScriptTitle}
          placeholder="Ex : vacances, tri-pro, enveloppe"
          required
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (showNewModal = false)} class="rounded-lg px-4 py-2 text-xs text-slate-400">Annuler</button>
          <button class="rounded-lg bg-[#48B17F] px-4 py-2 text-xs font-semibold text-[#08101A]">Créer</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if scriptToDelete}
  <ConfirmModal
    title="Supprimer le script Sieve"
    message={'Voulez-vous vraiment supprimer le script « ' + scriptToDelete.name + ' » du serveur Stalwart ? Cette action est irréversible.'}
    confirmLabel="Supprimer le script"
    onConfirm={confirmDeleteScript}
    onCancel={() => (scriptToDelete = null)}
  />
{/if}
