<script lang="ts">
  import type { JSCalendarEvent } from '../lib/jmap/calendar';

  interface DayCell {
    date: Date;
    ymd: string;
    inMonth?: boolean;
  }

  interface Props {
    view: 'month' | 'week' | 'day';
    days: string[];
    hours: number[];
    halfHourSlots: string[];
    monthCells: DayCell[];
    weekDays: DayCell[];
    todayYMD: string;
    dayYmd: string;
    dragOverYmd: string | null;
    dragOverSlotKey: string | null;
    eventsForDate: (ymd: string) => JSCalendarEvent[];
    eventsForHour: (ymd: string, hourStr: string) => JSCalendarEvent[];
    eventsForHalfHour: (ymd: string, slot: string) => JSCalendarEvent[];
    badgeFor: (ev: JSCalendarEvent) => string;
    formatTime: (iso: string) => string;
    taskProgressOf: (ev: JSCalendarEvent) => 'completed' | 'needs-action';
    onDropOnTarget: (e: DragEvent, ymd: string, slot?: string) => void;
    onOpenCreateModal: (ymd: string, hourOrSlot?: string) => void;
    onSelectDay: (date: Date) => void;
    onDragStart: (e: DragEvent, ev: JSCalendarEvent) => void;
    onDragEnd: () => void;
    onSelectEvent: (ev: JSCalendarEvent) => void;
    onToggleTaskDone: (ev: JSCalendarEvent) => void | Promise<void>;
    onOpenEditModal: (ev: JSCalendarEvent) => void;
    onRequestDelete: (ev: JSCalendarEvent) => void;
    onSlotRangeStart: (ymd: string, slot: string) => void;
    onSlotRangeMove: (ymd: string, slot: string) => void;
    onSlotRangeCommit: (ymd: string, slot: string) => boolean;
  }

  let {
    view,
    days,
    hours,
    halfHourSlots,
    monthCells,
    weekDays,
    todayYMD,
    dayYmd,
    dragOverYmd = $bindable(),
    dragOverSlotKey = $bindable(),
    eventsForDate,
    eventsForHour,
    eventsForHalfHour,
    badgeFor,
    formatTime,
    taskProgressOf,
    onDropOnTarget,
    onOpenCreateModal,
    onSelectDay,
    onDragStart,
    onDragEnd,
    onSelectEvent,
    onToggleTaskDone,
    onOpenEditModal,
    onRequestDelete,
    onSlotRangeStart,
    onSlotRangeMove,
    onSlotRangeCommit
  }: Props = $props();
</script>

{#if view === 'month'}
  <div class="env-subtle env-border env-muted grid grid-cols-7 border-b text-center text-xs font-semibold uppercase tracking-wider">
    {#each days as d}<div class="py-2.5">{d}</div>{/each}
  </div>
  <div class="env-divider grid flex-1 grid-cols-7 grid-rows-6 gap-1.5 overflow-hidden p-2">
    {#each monthCells as cell}
      <div
        role="button"
        tabindex="0"
        ondragover={(e) => { e.preventDefault(); dragOverYmd = cell.ymd; }}
        ondragleave={() => { if (dragOverYmd === cell.ymd) dragOverYmd = null; }}
        ondrop={(e) => onDropOnTarget(e, cell.ymd)}
        onclick={(e) => {
          if (e.target instanceof Element && e.target.closest('button')) return;
          onOpenCreateModal(cell.ymd);
        }}
        onkeydown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenCreateModal(cell.ymd);
          }
        }}
        class="env-card env-hover flex cursor-pointer flex-col overflow-hidden rounded-lg border p-2 text-left transition-colors {cell.inMonth ? '' : 'opacity-45'} {dragOverYmd === cell.ymd ? 'ring-2 ring-[var(--env-accent)]' : ''}"
      >
        <button
          type="button"
          title="Voir cette journée"
          onclick={(e) => { e.stopPropagation(); onSelectDay(cell.date); }}
          class="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs {cell.ymd === todayYMD ? 'env-accent-bg font-bold' : 'env-muted hover:ring-1 hover:ring-[var(--env-accent)]'}"
        >
          {cell.date.getDate()}
        </button>
        <div class="space-y-1 overflow-y-auto">
          {#each eventsForDate(cell.ymd).slice(0, 3) as ev}
            <div
              role="button"
              tabindex="0"
              draggable={Boolean(ev.id)}
              ondragstart={(e) => onDragStart(e, ev)}
              ondragend={onDragEnd}
              onclick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onSelectEvent(ev); } }}
              class="env-accent-soft group/ev flex items-center justify-between gap-1 rounded-lg px-2 py-0.5 text-xs font-medium {ev.id ? 'cursor-grab active:cursor-grabbing' : ''}"
            >
              <span class="truncate">
                {badgeFor(ev)}{#if !ev.showWithoutTime}<span class="font-mono text-[11px] opacity-80">{formatTime(ev.start)} </span>{/if}{ev.title}
              </span>

              {#if ev.id}
                <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/ev:opacity-100">
                  {#if ev.categories?.['Tâche']}
                    <button
                      type="button"
                      title={taskProgressOf(ev) === 'completed' ? 'Marquer comme à faire' : 'Marquer comme terminée'}
                      aria-label="{taskProgressOf(ev) === 'completed' ? 'Marquer comme à faire' : 'Marquer comme terminée'} {ev.title}"
                      onclick={(e) => { e.stopPropagation(); void onToggleTaskDone(ev); }}
                      class="rounded px-1 text-[11px] font-semibold hover:opacity-100"
                    >
                      {taskProgressOf(ev) === 'completed' ? '↩️' : '✓'}
                    </button>
                  {/if}
                  <button
                    type="button"
                    title="Modifier"
                    aria-label="Modifier {ev.title}"
                    onclick={(e) => { e.stopPropagation(); onOpenEditModal(ev); }}
                    class="text-xs hover:opacity-100"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    title="Supprimer"
                    aria-label="Supprimer {ev.title}"
                    onclick={(e) => { e.stopPropagation(); onRequestDelete(ev); }}
                    class="text-xs hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

{:else if view === 'week'}
  <div class="flex-1 overflow-auto p-3">
    <div class="env-card env-border min-w-[760px] overflow-hidden rounded-xl border">
      <div class="env-subtle env-border grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b text-center text-xs">
        <div class="env-faint flex items-center justify-center border-r py-2 font-mono text-[11px]">Heure</div>
        {#each weekDays as day, idx}
          <button
            type="button"
            onclick={() => onSelectDay(day.date)}
            class="env-border env-hover border-r py-2.5 last:border-r-0"
          >
            <div class="env-muted text-[11px] uppercase">{days[idx]}</div>
            <div class="mx-auto mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold {day.ymd === todayYMD ? 'env-accent-bg font-bold' : 'env-text'}">
              {day.date.getDate()}
            </div>
          </button>
        {/each}
      </div>

      <div class="divide-y env-divider">
        {#each hours as h}
          {@const hourStr = String(h).padStart(2, '0')}
          {@const slotLabel = `${hourStr}:00`}
          <div class="grid grid-cols-[68px_repeat(7,minmax(0,1fr))]">
            <div class="env-faint border-r px-2 py-2 text-right font-mono text-[11px]">{slotLabel}</div>
            {#each weekDays as day}
              {@const cellKey = `${day.ymd}T${slotLabel}`}
              {@const slotEvents = eventsForHour(day.ymd, hourStr)}
              <div
                role="button"
                tabindex="0"
                ondragover={(e) => { e.preventDefault(); dragOverSlotKey = cellKey; }}
                ondragleave={() => { if (dragOverSlotKey === cellKey) dragOverSlotKey = null; }}
                ondrop={(e) => onDropOnTarget(e, day.ymd, slotLabel)}
                onclick={() => onOpenCreateModal(day.ymd, hourStr)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenCreateModal(day.ymd, hourStr)}
                class="env-border env-hover min-h-14 cursor-pointer border-r p-1.5 transition-colors last:border-r-0 {dragOverSlotKey === cellKey ? 'env-accent-soft ring-2 ring-inset ring-[var(--env-accent)]' : ''}"
              >
                <div class="space-y-1">
                  {#each slotEvents as ev}
                    <div
                      role="button"
                      tabindex="0"
                      draggable={Boolean(ev.id)}
                      ondragstart={(e) => onDragStart(e, ev)}
                      ondragend={onDragEnd}
                      onclick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onSelectEvent(ev); } }}
                      class="env-accent-soft group/ev rounded-lg border border-[#48B17F]/35 px-2 py-1 text-xs {ev.id ? 'cursor-grab active:cursor-grabbing' : ''}"
                    >
                      <div class="flex items-center justify-between gap-1">
                        <span class="font-mono text-[11px] opacity-85">{formatTime(ev.start)}</span>
                        {#if ev.id}
                          <div class="flex shrink-0 items-center gap-0.5 opacity-75 group-hover/ev:opacity-100">
                            <button
                              type="button"
                              title="Modifier"
                              aria-label="Modifier {ev.title}"
                              onclick={(e) => { e.stopPropagation(); onOpenEditModal(ev); }}
                              class="rounded px-1 text-[11px] hover:opacity-100"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              title="Supprimer"
                              aria-label="Supprimer {ev.title}"
                              onclick={(e) => { e.stopPropagation(); onRequestDelete(ev); }}
                              class="rounded px-1 text-[11px] hover:text-red-400"
                            >
                              🗑️
                            </button>
                          </div>
                        {/if}
                      </div>
                      <div class="env-text truncate font-semibold">{badgeFor(ev)}{ev.title}</div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

{:else}
  <div class="flex-1 overflow-y-auto p-5">
    <div class="env-card env-divider mx-auto max-w-3xl divide-y rounded-xl border p-2">
      {#each halfHourSlots as slot}
        {@const cellKey = `${dayYmd}T${slot}`}
        {@const slotEvents = eventsForHalfHour(dayYmd, slot)}
        <div
          role="button"
          tabindex="0"
          ondragover={(e) => { e.preventDefault(); dragOverSlotKey = cellKey; }}
          ondragleave={() => { if (dragOverSlotKey === cellKey) dragOverSlotKey = null; }}
          ondrop={(e) => onDropOnTarget(e, dayYmd, slot)}
          onmousedown={() => onSlotRangeStart(dayYmd, slot)}
          onmouseenter={() => onSlotRangeMove(dayYmd, slot)}
          onclick={() => { if (!onSlotRangeCommit(dayYmd, slot)) onOpenCreateModal(dayYmd, slot); }}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenCreateModal(dayYmd, slot)}
          class="env-hover flex min-h-10 cursor-pointer items-start gap-4 rounded-lg px-4 py-1.5 transition-colors {slot.endsWith(':30') ? 'opacity-95' : ''} {dragOverSlotKey === cellKey ? 'env-accent-soft ring-2 ring-[var(--env-accent)]' : ''}"
        >
          <span class="env-faint w-14 shrink-0 font-mono text-xs">{slot}</span>
          <div class="flex-1 space-y-1">
            {#each slotEvents as ev}
              <div
                role="button"
                tabindex="0"
                draggable={Boolean(ev.id)}
                ondragstart={(e) => onDragStart(e, ev)}
                ondragend={onDragEnd}
                onclick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onSelectEvent(ev); } }}
                class="env-accent-soft rounded-xl border border-[#48B17F]/40 px-3.5 py-1.5 {ev.id ? 'cursor-grab active:cursor-grabbing' : ''}"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="env-text text-sm font-semibold">{badgeFor(ev)}{ev.title}</span>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs opacity-80">{formatTime(ev.start)}</span>
                    {#if ev.id}
                      {#if ev.categories?.['Tâche']}
                        <button
                          type="button"
                          onclick={(e) => { e.stopPropagation(); void onToggleTaskDone(ev); }}
                          class="rounded border px-2 py-0.5 text-[11px] font-medium env-btn-secondary"
                        >
                          {taskProgressOf(ev) === 'completed' ? 'À faire' : 'Terminée'}
                        </button>
                      {/if}
                      <button
                        type="button"
                        title="Modifier"
                        aria-label="Modifier {ev.title}"
                        onclick={(e) => { e.stopPropagation(); onOpenEditModal(ev); }}
                        class="rounded px-1.5 py-0.5 text-xs opacity-75 hover:opacity-100"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        title="Supprimer"
                        aria-label="Supprimer {ev.title}"
                        onclick={(e) => { e.stopPropagation(); onRequestDelete(ev); }}
                        class="rounded px-1.5 py-0.5 text-xs opacity-75 hover:bg-red-500/15 hover:text-red-400"
                      >
                        🗑️
                      </button>
                    {/if}
                  </div>
                </div>
                {#if ev.description}<p class="env-muted mt-0.5 text-xs">{ev.description}</p>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}
