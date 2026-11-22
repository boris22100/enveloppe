<script lang="ts">
  import { createContact, fetchContacts, importContactsJSON, type JSContact } from '../lib/jmap/contacts';
  import { contactsToVcf, vcfToContacts } from '../lib/utils/formats';

  let { accountId }: { accountId: string } = $props();
  let contacts = $state<JSContact[]>([]);
  let search = $state('');
  let showAdd = $state(false);
  let fullName = $state('');
  let email = $state('');
  let phone = $state('');

  async function load() {
    contacts = await fetchContacts(accountId);
  }
  $effect(() => { if (accountId) load(); });

  let groupedContacts = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const filtered = contacts
      .filter((c) => {
        if (!q) return true;
        const name = (c.name?.full || '').toLowerCase();
        const emails = Object.values(c.emails ?? {}).map((e) => e.address.toLowerCase()).join(' ');
        const phones = Object.values(c.phones ?? {}).map((p) => p.number).join(' ');
        return name.includes(q) || emails.includes(q) || phones.includes(q);
      })
      .sort((a, b) => {
        const na = (a.name?.full || Object.values(a.emails ?? {})[0]?.address || '').trim();
        const nb = (b.name?.full || Object.values(b.emails ?? {})[0]?.address || '').trim();
        return na.localeCompare(nb, 'fr', { sensitivity: 'base' });
      });

    const groups = new Map<string, JSContact[]>();
    for (const c of filtered) {
      const label = (c.name?.full || Object.values(c.emails ?? {})[0]?.address || '#').trim();
      const first = label.charAt(0).toUpperCase();
      const letter = /[A-ZÀ-ÿ]/.test(first) ? first.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '#';
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(c);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  });

  async function add(e: Event) {
    e.preventDefault();
    await createContact(accountId, fullName, email, phone);
    fullName = email = phone = '';
    showAdd = false;
    await load();
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const json = file.name.endsWith('.vcf') ? JSON.stringify(vcfToContacts(text)) : text;
    await importContactsJSON(accountId, json);
    await load();
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-[#0B1622]">
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
    <div class="flex items-center gap-3">
      <h2 class="text-base font-bold text-white">Contacts ({contacts.length})</h2>
      <input
        bind:value={search}
        placeholder="Filtrer par nom, mail, tél..."
        class="w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-[#48B17F] focus:outline-none"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <button onclick={() => (showAdd = !showAdd)} class="rounded-lg bg-[#48B17F] px-3 py-1.5 text-xs font-semibold text-[#08101A]">+ Contact</button>
      <button onclick={() => downloadFile(contactsToVcf(contacts), 'contacts.vcf', 'text/vcard')} class="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#48B17F]">Export .vcf</button>
      <label class="cursor-pointer rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#48B17F]">
        Importer
        <input type="file" accept=".vcf,.json" onchange={handleImport} class="hidden" />
      </label>
    </div>
  </header>

  {#if showAdd}
    <form onsubmit={add} class="grid grid-cols-1 gap-2 border-b border-slate-800 bg-[#0D1B2A] px-6 py-3 md:grid-cols-4">
      <input bind:value={fullName} placeholder="Nom complet" required class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white" />
      <input bind:value={email} type="email" placeholder="Email" required class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white" />
      <input bind:value={phone} placeholder="Téléphone" class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white" />
      <div class="flex gap-2">
        <button class="flex-1 rounded-lg bg-[#48B17F] px-3 py-1.5 text-xs font-semibold text-[#08101A]">Ajouter</button>
        <button type="button" onclick={() => (showAdd = false)} class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400">Annuler</button>
      </div>
    </form>
  {/if}

  <div class="flex-1 overflow-y-auto px-6 py-4">
    <div class="mx-auto max-w-4xl space-y-5">
      {#each groupedContacts as [letter, list]}
        <div>
          <div class="sticky top-0 z-10 border-b border-slate-800 bg-[#0B1622]/95 py-1 text-xs font-bold text-[#48B17F] backdrop-blur">
            {letter}
          </div>
          <div class="divide-y divide-slate-800/60">
            {#each list as c}
              {@const displayName = c.name?.full || Object.values(c.emails ?? {})[0]?.address || 'Sans nom'}
              <div class="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-slate-800/20 px-2 rounded-lg">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0D3A4D] text-xs font-bold text-[#48B17F]">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span class="truncate text-sm font-medium text-white">{displayName}</span>
                </div>
                <div class="flex flex-wrap items-center gap-4 text-xs">
                  {#each Object.values(c.emails ?? {}) as em}
                    <span class="text-[#48B17F]">{em.address}</span>
                  {/each}
                  {#each Object.values(c.phones ?? {}) as ph}
                    <span class="text-slate-400">{ph.number}</span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="py-12 text-center text-sm text-slate-500">Aucun contact trouvé.</p>
      {/each}
    </div>
  </div>
</div>
