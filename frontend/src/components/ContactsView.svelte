<script lang="ts">
  import { createContact, deleteContact, fetchContacts, importContactsJSON, type JSContact } from '../lib/jmap/contacts';
  import { contactsToVcf, vcfToContacts } from '../lib/utils/formats';
  import ConfirmModal from './ConfirmModal.svelte';

  let { accountId, onComposeTo }: { accountId: string } = $props();
  let contacts = $state<JSContact[]>([]);
  let search = $state('');
  let showAdd = $state(false);
  let fullName = $state('');
  let email = $state('');
  let phone = $state('');
  let contactToDelete = $state<{ id: string; name: string } | null>(null);

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

  async function confirmDeleteContact() {
    if (!contactToDelete) return;
    await deleteContact(accountId, contactToDelete.id);
    contactToDelete = null;
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

<div class="flex h-full flex-col overflow-hidden">
  <header class="env-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="env-text text-lg font-bold">Contacts ({contacts.length})</h2>
      <input
        bind:value={search}
        aria-label="Rechercher un contact"
        placeholder="Filtrer par nom, mail, tél..."
        class="env-input w-64 rounded-xl border px-3.5 py-2 text-sm"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" onclick={() => (showAdd = !showAdd)} class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold hover:opacity-95">+ Contact</button>
      <button type="button" onclick={() => downloadFile(contactsToVcf(contacts), 'contacts.vcf', 'text/vcard')} class="env-input env-hover rounded-xl border px-3.5 py-2 text-xs font-medium">Export .vcf</button>
      <label class="env-input env-hover cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-medium">
        Importer
        <input type="file" accept=".vcf,.json" onchange={handleImport} class="hidden" />
      </label>
    </div>
  </header>

  {#if showAdd}
    <form onsubmit={add} class="env-subtle env-border grid grid-cols-1 gap-2.5 border-b px-6 py-3.5 md:grid-cols-4">
      <input bind:value={fullName} aria-label="Nom complet" placeholder="Nom complet" required class="env-input rounded-xl border px-3.5 py-2 text-sm" />
      <input bind:value={email} type="email" aria-label="Adresse email" placeholder="Email" required class="env-input rounded-xl border px-3.5 py-2 text-sm" />
      <input bind:value={phone} aria-label="Téléphone" placeholder="Téléphone" class="env-input rounded-xl border px-3.5 py-2 text-sm" />
      <div class="flex gap-2">
        <button class="env-accent-bg flex-1 rounded-xl px-3.5 py-2 text-xs font-semibold">Ajouter</button>
        <button type="button" onclick={() => (showAdd = false)} class="env-input env-hover env-muted rounded-xl border px-3.5 py-2 text-xs">Annuler</button>
      </div>
    </form>
  {/if}

  <div class="flex-1 overflow-y-auto px-6 py-5">
    <div class="mx-auto max-w-4xl space-y-6">
      {#each groupedContacts as [letter, list]}
        <div class="env-card rounded-xl border p-4 shadow-xs">
          <div class="env-border env-accent-text mb-2 border-b pb-1.5 text-xs font-bold uppercase tracking-wider">
            {letter}
          </div>
          <div class="env-divider divide-y">
            {#each list as c}
              {@const displayName = c.name?.full || Object.values(c.emails ?? {})[0]?.address || 'Sans nom'}
              <div class="env-hover group flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="env-accent-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span class="env-text truncate text-sm font-medium">{displayName}</span>
                </div>
                <div class="flex flex-wrap items-center gap-4 text-xs">
                  {#each Object.values(c.emails ?? {}) as em}
                    <span class="env-accent-text font-medium">{em.address}</span>
                  {/each}
                  {#each Object.values(c.phones ?? {}) as ph}
                    <span class="env-muted">{ph.number}</span>
                  {/each}
                  {#if c.id}
                    <button
                      type="button"
                      title="Supprimer ce contact"
                      aria-label="Supprimer {displayName}"
                      onclick={() => (contactToDelete = { id: c.id!, name: displayName })}
                      class="env-muted rounded-xl px-2.5 py-1.5 text-sm opacity-75 transition-opacity hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                    >
                      🗑️
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="env-faint py-12 text-center text-sm">Aucun contact trouvé.</p>
      {/each}
    </div>
  </div>
</div>

{#if contactToDelete}
  <ConfirmModal
    title="Supprimer le contact"
    message={"Voulez-vous vraiment supprimer « " + contactToDelete.name + " » de votre carnet d'adresses ? Cette action est définitive."}
    confirmLabel="Supprimer le contact"
    onConfirm={confirmDeleteContact}
    onCancel={() => (contactToDelete = null)}
  />
{/if}
