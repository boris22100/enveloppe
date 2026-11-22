<script lang="ts">
  let { name = '', email = '' }: { name?: string; email?: string } = $props();

  let imgError = $state(false);

  const GENERIC_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.fr',
    'live.com', 'yahoo.com', 'yahoo.fr', 'orange.fr', 'wanadoo.fr', 'free.fr',
    'sfr.fr', 'laposte.net', 'icloud.com', 'proton.me', 'protonmail.com'
  ]);

  let domain = $derived(email.includes('@') ? email.split('@')[1].toLowerCase().trim() : '');
  let showLogo = $derived(!imgError && !!domain && !GENERIC_DOMAINS.has(domain));
  let logoUrl = $derived(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);

  let initials = $derived.by(() => {
    const src = (name || email || '?').trim();
    const parts = src.split(/[\s.@_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  });

  let bgColor = $derived.by(() => {
    const palette = ['#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669', '#4F46E5'];
    let hash = 0;
    const str = email || name || 'x';
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  });
</script>

<div
  class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-sm"
  style="background-color: {showLogo ? '#ffffff' : bgColor};"
>
  {#if showLogo}
    <img
      src={logoUrl}
      alt={domain}
      loading="lazy"
      onerror={() => (imgError = true)}
      class="h-6 w-6 object-contain"
    />
  {:else}
    <span>{initials}</span>
  {/if}
</div>
