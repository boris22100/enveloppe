<script lang="ts">
  import SieveRuleEditor from './sieve/SieveRuleEditor.svelte';

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

<div class="flex h-full overflow-hidden">
  <aside aria-label="Scripts Sieve" class="env-subtle env-border flex w-72 shrink-0 flex-col border-r p-4">
    <div class="mb-3.5 flex items-center justify-between">
      <span class="env-muted text-xs font-semibold uppercase tracking-wider">Scripts Sieve</span>
      <button
        type="button"
        onclick={() => (showNewModal = true)}
        class="env-accent-bg rounded-xl px-3 py-1.5 text-xs font-semibold hover:opacity-95"
      >
        + Script
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
          <h2 class="env-text text-lg font-bold">Filtres serveur (Sieve)</h2>
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
            🧩 Règles visuelles
          </button>
          <button
            type="button"
            onclick={() => switchMode('code')}
            class="rounded-lg px-3 py-1.5 {mode === 'code' ? 'env-accent-soft font-semibold' : 'env-muted'}"
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
          class="env-input env-hover rounded-xl border px-3.5 py-2 text-xs font-medium disabled:opacity-50"
        >
          {validating ? 'Vérification...' : '✓ Valider la syntaxe'}
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
          {saving ? 'Envoi...' : '💾 Enregistrer sur Stalwart'}
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
            <h3 class="env-text text-sm font-semibold">Règles de filtrage ({rules.length})</h3>
            <button
              type="button"
              onclick={addRule}
              class="env-accent-soft rounded-xl border border-[#48B17F]/40 px-3.5 py-2 text-xs font-semibold hover:opacity-90"
            >
              + Ajouter une règle
            </button>
          </div>

          {#each rules as rule}
            <div class="env-card space-y-4 rounded-xl border p-5 shadow-xs">
              <div class="env-border flex flex-wrap items-center justify-between gap-2 border-b pb-3.5">
                <div class="flex flex-wrap items-center gap-2.5">
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
                    class="env-input rounded-xl border px-3 py-1.5 text-xs font-semibold"
                  />
                  <select
                    bind:value={rule.matchType}
                    onchange={syncVisualToCode}
                    aria-label="Logique des conditions"
                    class="env-input rounded-xl border px-3 py-1.5 text-xs"
                  >
                    <option value="allof">Si TOUTES les conditions sont vraies</option>
                    <option value="anyof">Si AU MOINS UNE condition est vraie</option>
                  </select>
                </div>

                <button
                  type="button"
                  onclick={() => removeRule(rule.id)}
                  class="env-muted rounded-xl px-2.5 py-1.5 text-xs hover:bg-red-500/15 hover:text-red-400"
                >
                  🗑️ Supprimer
                </button>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold uppercase tracking-wider text-sky-400">Conditions</span>
                  <button type="button" onclick={() => addCondition(rule)} class="env-muted env-accent-text text-xs font-medium">+ Condition</button>
                </div>

                {#each rule.conditions as cond}
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      bind:value={cond.field}
                      onchange={syncVisualToCode}
                      aria-label="Champ du message"
                      class="env-input rounded-xl border px-3 py-2 text-xs"
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
                        class="env-input w-36 rounded-xl border px-3 py-2 text-xs"
                      />
                    {/if}

                    {#if cond.field === 'size'}
                      <select
                        bind:value={cond.operator}
                        onchange={syncVisualToCode}
                        aria-label="Comparateur de taille"
                        class="env-input rounded-xl border px-3 py-2 text-xs"
                      >
                        <option value="over">dépasse</option>
                        <option value="under">est inférieur à</option>
                      </select>
                      <input
                        bind:value={cond.value}
                        oninput={syncVisualToCode}
                        placeholder="Ex: 5M ou 500K"
                        class="env-input min-w-44 flex-1 rounded-xl border px-3.5 py-2 text-xs"
                      />
                    {:else}
                      <select
                        bind:value={cond.operator}
                        onchange={syncVisualToCode}
                        aria-label="Opérateur"
                        class="env-input rounded-xl border px-3 py-2 text-xs"
                      >
                        <option value="contains">contient</option>
                        <option value="is">est exactement</option>
                        <option value="matches">correspond à (* ?)</option>
                      </select>
                      <input
                        bind:value={cond.value}
                        oninput={syncVisualToCode}
                        placeholder={cond.field === 'from' ? 'ex: newsletter@domaine.fr' : 'Texte à rechercher...'}
                        class="env-input min-w-48 flex-1 rounded-xl border px-3.5 py-2 text-xs"
                      />
                    {/if}

                    {#if rule.conditions.length > 1}
                      <button
                        type="button"
                        onclick={() => removeCondition(rule, cond.id)}
                        aria-label="Supprimer la condition"
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
                  <button type="button" onclick={() => addAction(rule)} class="env-muted env-accent-text text-xs font-medium">+ Action</button>
                </div>

                {#each rule.actions as act}
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      bind:value={act.type}
                      onchange={() => onActionTypeChange(act)}
                      aria-label="Type d'action"
                      class="env-input rounded-xl border px-3 py-2 text-xs"
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
                        oninput={syncVisualToCode}
                        placeholder="destinataire@domaine.fr"
                        class="env-input min-w-48 flex-1 rounded-xl border px-3.5 py-2 text-xs"
                      />
                    {:else if act.type === 'reject'}
                      <input
                        bind:value={act.value}
                        oninput={syncVisualToCode}
                        placeholder="Motif du rejet..."
                        class="env-input min-w-48 flex-1 rounded-xl border px-3.5 py-2 text-xs"
                      />
                    {/if}

                    {#if rule.actions.length > 1}
                      <button
                        type="button"
                        onclick={() => removeAction(rule, act.id)}
                        aria-label="Supprimer l'action"
                        class="env-faint rounded-xl px-2 py-1.5 text-xs hover:text-red-400"
                      >
                        ✕
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="env-card env-muted rounded-xl border border-dashed p-8 text-center text-xs">
              Aucune règle visuelle configurée. Clique sur <strong>+ Ajouter une règle</strong> ou utilise un modèle dans l'onglet <strong>Code Sieve</strong>.
            </div>
          {/each}

          <div class="env-card space-y-3 rounded-xl border p-5 shadow-xs">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <input
                  id="vac-toggle"
                  type="checkbox"
                  bind:checked={vacation.enabled}
                  onchange={syncVisualToCode}
                  class="h-4 w-4 accent-[#48B17F]"
                />
                <label for="vac-toggle" class="env-text cursor-pointer text-sm font-semibold">
                  🏖️ Répondeur automatique (Absence / Vacances)
                </label>
              </div>
              <span class="env-faint text-xs">Extension RFC 5230 <code>vacation</code></span>
            </div>

            {#if vacation.enabled}
              <div class="grid grid-cols-1 gap-3 pt-2 md:grid-cols-4">
                <div>
                  <label for="vac-days" class="env-muted mb-1 block text-xs">Fréquence (jours)</label>
                  <input
                    id="vac-days"
                    type="number"
                    min="1"
                    max="60"
                    bind:value={vacation.days}
                    oninput={syncVisualToCode}
                    class="env-input w-full rounded-xl border px-3 py-2 text-xs"
                  />
                </div>
                <div class="md:col-span-3">
                  <label for="vac-subj" class="env-muted mb-1 block text-xs">Objet de la réponse</label>
                  <input
                    id="vac-subj"
                    bind:value={vacation.subject}
                    oninput={syncVisualToCode}
                    placeholder="Absence du bureau"
                    class="env-input w-full rounded-xl border px-3 py-2 text-xs"
                  />
                </div>
                <div class="md:col-span-4">
                  <label for="vac-body" class="env-muted mb-1 block text-xs">Message envoyé automatiquement</label>
                  <textarea
                    id="vac-body"
                    rows="3"
                    bind:value={vacation.reason}
                    oninput={syncVisualToCode}
                    placeholder="Bonjour, je suis actuellement absent..."
                    class="env-input w-full rounded-lg border p-3 text-xs"
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
          <span class="env-muted text-xs font-semibold uppercase tracking-wider">Modèles :</span>
          {#each SIEVE_TEMPLATES as tpl}
            <button
              type="button"
              title={tpl.description}
              onclick={() => {
                rawCode = rawCode.trim() ? rawCode.trim() + '\n\n' + tpl.code : tpl.code;
                applyCodeToVisual(rawCode);
              }}
              class="env-input env-hover rounded-xl border px-3 py-1.5 text-xs font-medium"
            >
              {tpl.label}
            </button>
          {/each}
        </div>

        <div class="env-subtle env-border relative flex flex-1 overflow-hidden rounded-xl border font-mono text-xs shadow-inner">
          <div
            aria-hidden="true"
            class="env-border env-faint select-none border-r px-3.5 py-4 text-right leading-6"
          >
            {#each Array.from({ length: lineCount }, (_, i) => i + 1) as n}
              <div>{n}</div>
            {/each}
          </div>

          <div class="relative flex-1 overflow-hidden">
            <pre
              bind:this={preEl}
              aria-hidden="true"
              class="env-text pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6"
            >{@html highlightedHtml}</pre>

            <textarea
              bind:this={textareaEl}
              bind:value={rawCode}
              onscroll={syncScroll}
              onkeydown={handleEditorKeydown}
              spellcheck="false"
              aria-label="Éditeur de code Sieve"
              placeholder={'require ["fileinto"];\n\nif header :contains "From" "exemple@domaine.fr" {\n    fileinto "Archives";\n}'}
              class="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-xs leading-6 text-transparent caret-[#48B17F] selection:bg-[var(--env-accent)]/30 focus:outline-none"
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
    aria-labelledby="new-sieve-title"
    tabindex="-1"
    onclick={() => (showNewModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showNewModal = false)}
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
  >
    <div
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      class="w-full max-w-sm"
    >
      <form
        onsubmit={handleCreateNewScript}
        class="env-card space-y-4 rounded-xl border p-7 shadow-2xl"
      >
        <h3 id="new-sieve-title" class="env-text text-lg font-semibold">Nouveau script Sieve</h3>
        <input
          bind:value={newScriptTitle}
          aria-label="Nom du nouveau script"
          placeholder="Ex : vacances, tri-pro, enveloppe"
          required
          class="env-input w-full rounded-xl border px-3.5 py-2.5 text-sm"
        />
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (showNewModal = false)} class="env-muted env-hover rounded-xl px-4 py-2 text-xs">Annuler</button>
          <button class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold">Créer</button>
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
