<script lang="ts">
  interface Props {
    headerLabel: string;
    view: 'month' | 'week' | 'day';
    taskFilter: 'all' | 'todo' | 'completed';
    onShift: (delta: number) => void;
    onToday: () => void;
    onViewChange: (v: 'month' | 'week' | 'day') => void;
    onNewEvent: () => void;
    onTaskFilterChange: (f: 'all' | 'todo' | 'completed') => void;
    onExportIcs: () => void;
    onImport: (e: Event) => void;
  }

  let {
    headerLabel,
    view,
    taskFilter,
    onShift,
    onToday,
    onViewChange,
    onNewEvent,
    onTaskFilterChange,
    onExportIcs,
    onImport
  }: Props = $props();
</script>

<header class="env-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
  <div class="flex items-center gap-3">
    <div class="env-input flex items-center overflow-hidden rounded-xl border">
      <button type="button" onclick={() => onShift(-1)} aria-label="Période précédente" class="env-hover px-3 py-1.5 text-sm font-medium">‹</button>
      <button type="button" onclick={onToday} class="env-border env-hover border-x px-3.5 py-1.5 text-xs font-semibold">Aujourd'hui</button>
      <button type="button" onclick={() => onShift(1)} aria-label="Période suivante" class="env-hover px-3 py-1.5 text-sm font-medium">›</button>
    </div>
    <h2 class="env-text text-lg font-bold capitalize">{headerLabel}</h2>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <div class="env-subtle env-border flex rounded-xl border p-0.5 text-xs">
      <button type="button" onclick={() => onViewChange('month')} class="rounded-lg px-3 py-1.5 {view === 'month' ? 'env-accent-soft font-semibold' : 'env-muted'}">Mois</button>
      <button type="button" onclick={() => onViewChange('week')} class="rounded-lg px-3 py-1.5 {view === 'week' ? 'env-accent-soft font-semibold' : 'env-muted'}">Semaine</button>
      <button type="button" onclick={() => onViewChange('day')} class="rounded-lg px-3 py-1.5 {view === 'day' ? 'env-accent-soft font-semibold' : 'env-muted'}">Jour</button>
    </div>

    <button type="button" onclick={onNewEvent} class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold hover:opacity-95">+ Nouveau</button>
    <div class="inline-flex items-center gap-1 rounded-lg border p-0.5 text-xs" role="group" aria-label="Filtre des tâches">
      <button type="button" onclick={() => onTaskFilterChange('all')} class="rounded px-2 py-1 {taskFilter === 'all' ? 'env-accent-soft font-semibold' : 'env-muted'}">Toutes</button>
      <button type="button" onclick={() => onTaskFilterChange('todo')} class="rounded px-2 py-1 {taskFilter === 'todo' ? 'env-accent-soft font-semibold' : 'env-muted'}">À faire</button>
      <button type="button" onclick={() => onTaskFilterChange('completed')} class="rounded px-2 py-1 {taskFilter === 'completed' ? 'env-accent-soft font-semibold' : 'env-muted'}">Terminées</button>
    </div>
    <button type="button" onclick={onExportIcs} class="env-input env-hover rounded-xl border px-3 py-2 text-xs font-medium">.ics</button>
    <label class="env-input env-hover cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium">
      Importer
      <input type="file" accept=".ics,.json" onchange={onImport} class="hidden" aria-label="Importer un calendrier (.ics ou .json)" />
    </label>
  </div>
</header>
