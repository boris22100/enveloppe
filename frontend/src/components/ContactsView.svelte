<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getLocale, subscribeLocale, t, type Locale } from '../lib/i18n';
  let activeLocale = $state<Locale>(getLocale());
  const _unsubLocale = subscribeLocale((l) => (activeLocale = l));
  onDestroy(_unsubLocale);
  let editingContact = $state<any>(null);
  let editName = $state('');
  let editEmail = $state('');
  let editPhone = $state('');
  let editNotes = $state('');
  let editSaving = $state(false);
  let editError = $state('');
  function openEditContact(item: any) {
    editingContact = item;
    editName = typeof item?.name === 'string' ? item.name : (item?.name?.full || item?.fullName || item?.displayName || '');
    const emailVals = item?.emails ? Object.values(item.emails).map((v: any) => (typeof v === 'string' ? v : v?.address || v?.value || '')).filter(Boolean) : [];
    const firstEmail = emailVals[0] || item?.email || '';
    editEmail = firstEmail;
    const firstPhone = Array.isArray(item?.phones)
      ? (typeof item.phones[0] === 'string' ? item.phones[0] : item.phones[0]?.value || '')
      : (item?.phone || '');
    editPhone = firstPhone;
    editNotes = item?.notes || item?.note || '';
    editError = '';
  }
  async function saveEditedContact(e: Event) {
    e.preventDefault();
    if (!editingContact) return;
    editSaving = true;
    editError = '';
    const id = editingContact.id || editingContact._id || editingContact.uid;
    const payload = {
      ...editingContact,
      name: editName.trim(),
      fullName: editName.trim(),
      email: editEmail.trim(),
      emails: editEmail.trim() ? [{ value: editEmail.trim() }] : [],
      phone: editPhone.trim(),
      phones: editPhone.trim() ? [{ value: editPhone.trim() }] : [],
      notes: editNotes
    };
    try {
      let ok = false;
      if (id) {
        for (const [method, url] of [
          ['PUT', `/api/jmap/${encodeURIComponent(accountId)}/contacts/${encodeURIComponent(id)}`],
          ['PATCH', `/api/jmap/${encodeURIComponent(accountId)}/contacts/${encodeURIComponent(id)}`],
          ['PUT', `/api/jmap/${encodeURIComponent(accountId)}/contact/${encodeURIComponent(id)}`],
          ['POST', `/api/jmap/${encodeURIComponent(accountId)}/contacts/${encodeURIComponent(id)}`]
        ]) {
          const r = await fetch(url as string, {
            method: method as string,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (r.ok) { ok = true; break; }
        }
      }
      if (!ok) {
        const r = await fetch(`/api/jmap/${encodeURIComponent(accountId)}/contacts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        ok = r.ok;
      }
      if (!ok) {
        editError = "Impossible d'enregistrer la modification côté serveur.";
        return;
      }
      if (typeof contacts !== 'undefined' && Array.isArray(contacts)) {
        contacts = contacts.map((x: any) => ((x.id || x._id) === id ? { ...x, ...payload } : x));
      }
      editingContact = null;
    } catch (err: any) {
      editError = err?.message || t('contacts.networkError', undefined, activeLocale);
    } finally {
      editSaving = false;
    }
  }
  function composeToEmail(addr: string, name?: string) {
    const clean = (addr || '').trim();
    if (!clean) return;
    if (typeof onComposeTo === 'function') {
      onComposeTo(clean, name);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enveloppe:compose', { detail: { email: clean, name } }));
    }
  }
  import { createContact, deleteContact, fetchContacts, importContactsJSON, type JSContact } from '../lib/jmap/contacts';
  import { contactsToVcf, vcfToContacts } from '../lib/utils/formats';
  import ConfirmModal from './ConfirmModal.svelte';
  let { accountId, onComposeTo }: { accountId: string; onComposeTo?: (email: string, name?: string) => void } = $props();
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
      <h2 class="env-text text-lg font-bold">{t('contacts.title', undefined, activeLocale)} ({contacts.length})</h2>
      <input
        bind:value={search}
        aria-label={t('contacts.searchAria', undefined, activeLocale)}
        placeholder={t('contacts.searchPlaceholder', undefined, activeLocale)}
        class="env-input w-64 rounded-xl border px-3.5 py-2 text-sm"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <div class="flex items-center justify-between gap-2">
                      <button type="button" onclick={() => (showAdd = !showAdd)} class="env-accent-bg rounded-xl px-4 py-2 text-xs font-semibold hover:opacity-95">{t('contacts.newContact', undefined, activeLocale)}</button>
      <button type="button" onclick={() => downloadFile(contactsToVcf(contacts), 'contacts.vcf', 'text/vcard')} class="env-input env-hover rounded-xl border px-3.5 py-2 text-xs font-medium">{t('contacts.exportVcf', undefined, activeLocale)}</button>
      <label class="env-input env-hover cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-medium">
        Importer
        <input type="file" accept=".vcf,.json" onchange={handleImport} class="hidden" aria-label={t('contacts.importAria', undefined, activeLocale)} />
      </label>
    </div>
    </div>
  </header>
  {#if showAdd}
    <form onsubmit={add} class="env-subtle env-border grid grid-cols-1 gap-2.5 border-b px-6 py-3.5 md:grid-cols-4">
      <input bind:value={fullName} aria-label="Nom complet" placeholder="Nom complet" required class="env-input rounded-xl border px-3.5 py-2 text-sm" />
      <input bind:value={email} type="email" aria-label="Adresse email" placeholder="Email" required class="env-input rounded-xl border px-3.5 py-2 text-sm" />
      <input bind:value={phone} aria-label={t('contacts.phone', undefined, activeLocale)} placeholder={t('contacts.phone', undefined, activeLocale)} class="env-input rounded-xl border px-3.5 py-2 text-sm" />
      <div class="flex gap-2">
        <button class="env-accent-bg flex-1 rounded-xl px-3.5 py-2 text-xs font-semibold">{t('common.add', undefined, activeLocale)}</button>
        <button type="button" onclick={() => (showAdd = false)} class="env-input env-hover env-muted rounded-xl border px-3.5 py-2 text-xs">{t('common.cancel', undefined, activeLocale)}</button>
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
                    <div class="flex items-center justify-between gap-2"><button type="button" onclick={() => composeToEmail(String(em.address))} class="env-accent-text text-left text-xs hover:underline">{em.address}
      
    </button>
  
</div>
                  {/each}
                  {#each Object.values(c.phones ?? {}) as ph}
                    <span class="env-muted">{ph.number}</span>
                  {/each}
                  {#if c.id}
                    <button
                      type="button"
                      title={t('common.edit', undefined, activeLocale)}
                      aria-label={`${t('common.editAriaPrefix', undefined, activeLocale)} ${displayName}`}
                      onclick={() => openEditContact(c)}
                      class="env-muted rounded-xl px-2.5 py-1.5 text-sm opacity-75 transition-opacity hover:bg-white/10 hover:text-[var(--env-text)] group-hover:opacity-100"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      title={t('common.delete', undefined, activeLocale)}
                      aria-label={`${t('common.deleteAriaPrefix', undefined, activeLocale)} ${displayName}`}
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
        <p class="env-faint py-12 text-center text-sm">{t('contacts.noneFound', undefined, activeLocale)}</p>
      {/each}
    </div>
  </div>
</div>
{#if contactToDelete}
  <ConfirmModal
    title={t('contacts.deleteContact', undefined, activeLocale)}
    message={"Voulez-vous vraiment supprimer « " + contactToDelete.name + " » de votre carnet d'adresses ? Cette action est définitive."}
    confirmLabel={t('contacts.deleteContact', undefined, activeLocale)}
    onConfirm={confirmDeleteContact}
    onCancel={() => (contactToDelete = null)}
  />
{/if}
{#if editingContact}
  <div role="dialog" aria-modal="true" class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
    <form onsubmit={saveEditedContact} class="env-card w-full max-w-md space-y-3 rounded-xl border p-5 shadow-2xl">
      <h3 class="env-text text-base font-bold">{t('contacts.editContact', undefined, activeLocale)}</h3>
      <div>
        <label for="edit-contact-name" class="env-muted mb-1 block text-xs">Nom</label>
        <input id="edit-contact-name" aria-label={t('contacts.nameAria', undefined, activeLocale)} placeholder="Nom complet" bind:value={editName} type="text" required class="env-input w-full rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="edit-contact-email" class="env-muted mb-1 block text-xs">Adresse e-mail</label>
        <input id="edit-contact-email" aria-label={t('contacts.emailAria', undefined, activeLocale)} placeholder="prenom.nom@domaine.fr" bind:value={editEmail} type="email" class="env-input w-full rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="edit-contact-phone" class="env-muted mb-1 block text-xs">{t('contacts.phone', undefined, activeLocale)}</label>
        <input id="edit-contact-phone" aria-label={t('contacts.phoneAria', undefined, activeLocale)} placeholder="+33 6 00 00 00 00" bind:value={editPhone} type="tel" class="env-input w-full rounded-lg border px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="edit-contact-notes" class="env-muted mb-1 block text-xs">Notes</label>
        <textarea id="edit-contact-notes" bind:value={editNotes} rows="2" class="env-input w-full rounded-lg border px-3 py-2 text-sm"></textarea>
      </div>
      {#if editError}
        <p class="text-xs text-red-400">{editError}</p>
      {/if}
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick={() => (editingContact = null)} class="env-input env-muted rounded-lg border px-3.5 py-1.5 text-xs">{t('common.cancel', undefined, activeLocale)}</button>
        <button type="submit" disabled={editSaving} class="env-accent-bg rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
          {editSaving ? t('common.saving', undefined, activeLocale) : 'Enregistrer'}
        </button>
      </div>
    </form>
  </div>
{/if}
