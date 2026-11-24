<script lang="ts">
  import { highlightSieveCode } from '../../lib/utils/sieveGenerator';

  let {
    rawCode = $bindable(''),
    onKeydown
  }: {
    rawCode?: string;
    onKeydown?: (e: KeyboardEvent) => void;
  } = $props();

  let preEl = $state<HTMLPreElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  let lineCount = $derived(Math.max(12, rawCode.split('\n').length));
  let highlightedHtml = $derived(highlightSieveCode(rawCode) + '\n');

  function syncScroll() {
    if (preEl && textareaEl) {
      preEl.scrollTop = textareaEl.scrollTop;
      preEl.scrollLeft = textareaEl.scrollLeft;
    }
  }
</script>

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
      onkeydown={onKeydown}
      spellcheck="false"
      aria-label="Éditeur de code Sieve"
      placeholder={'require ["fileinto"];\n\nif header :contains "From" "exemple@domaine.fr" {\n    fileinto "Archives";\n}'}
      class="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-xs leading-6 text-transparent caret-[#48B17F] selection:bg-[var(--env-accent)]/30 focus:outline-none"
    ></textarea>
  </div>
</div>
