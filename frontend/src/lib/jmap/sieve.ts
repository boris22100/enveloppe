import { getDownloadUrl, getPrimaryAccountId, jmapCall, uploadAttachment } from './client';

const CAP = 'urn:ietf:params:jmap:sieve';

export interface SieveScript {
  id: string;
  name: string;
  blobId: string;
  isActive: boolean;
}

export async function fetchSieveScripts(accountId: string): Promise<{ jmapAccountId: string; scripts: SieveScript[] }> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(accountId, [['SieveScript/get', { accountId: accId }, 'sv0']], [CAP]);
  const respName = res.methodResponses?.[0]?.[0];
  const payload = res.methodResponses?.[0]?.[1];
  if (respName === 'error') {
    throw new Error(payload?.description || 'Capability JMAP Sieve non activée sur ce serveur.');
  }
  return {
    jmapAccountId: accId,
    scripts: (payload?.list ?? []) as SieveScript[]
  };
}

export async function fetchSieveScriptContent(accountId: string, jmapAccountId: string, blobId: string): Promise<string> {
  if (!blobId) return '';
  const url = getDownloadUrl(accountId, jmapAccountId, {
    blobId,
    name: 'script.siv',
    type: 'application/sieve',
    size: 0
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error('Impossible de télécharger le contenu du script Sieve.');
  return res.text();
}

async function uploadSieveContent(accountId: string, content: string): Promise<string> {
  const file = new File([content], 'script.siv', { type: 'application/sieve' });
  const att = await uploadAttachment(accountId, file);
  return att.blobId;
}

export async function validateSieveScript(accountId: string, content: string): Promise<{ valid: boolean; error?: string }> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const blobId = await uploadSieveContent(accountId, content);
  const res = await jmapCall(accountId, [['SieveScript/validate', { accountId: accId, blobId }, 'svv0']], [CAP]);
  const respName = res.methodResponses?.[0]?.[0];
  const payload = res.methodResponses?.[0]?.[1];
  if (respName === 'error') {
    return { valid: false, error: payload?.description || payload?.type || 'Erreur de validation JMAP' };
  }
  if (payload?.error) {
    return { valid: false, error: payload.error.description || payload.error.type || 'Syntaxe Sieve invalide' };
  }
  return { valid: true };
}

export async function saveSieveScript(
  accountId: string,
  opts: { id?: string; name: string; content: string; activate?: boolean }
): Promise<string> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const blobId = await uploadSieveContent(accountId, opts.content);

  const args: Record<string, any> = { accountId: accId };
  if (opts.id) {
    args.update = { [opts.id]: { name: opts.name, blobId } };
    if (opts.activate) args.onSuccessActivateScript = opts.id;
  } else {
    args.create = { s1: { name: opts.name, blobId } };
    if (opts.activate) args.onSuccessActivateScript = '#s1';
  }

  const res = await jmapCall(accountId, [['SieveScript/set', args, 'svs0']], [CAP]);
  const respName = res.methodResponses?.[0]?.[0];
  const payload = res.methodResponses?.[0]?.[1];
  if (respName === 'error') {
    throw new Error(payload?.description || 'Erreur lors de la sauvegarde du script Sieve.');
  }
  if (payload?.notCreated?.s1) {
    throw new Error(payload.notCreated.s1.description || payload.notCreated.s1.type || 'Création refusée par Stalwart');
  }
  if (opts.id && payload?.notUpdated?.[opts.id]) {
    throw new Error(payload.notUpdated[opts.id].description || payload.notUpdated[opts.id].type || 'Mise à jour refusée par Stalwart');
  }
  return opts.id || payload?.created?.s1?.id || '';
}

export async function activateSieveScript(accountId: string, scriptId: string | null): Promise<void> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const args: Record<string, any> = { accountId: accId };
  if (scriptId) {
    args.onSuccessActivateScript = scriptId;
  } else {
    args.onSuccessDeactivateScript = true;
  }
  const res = await jmapCall(accountId, [['SieveScript/set', args, 'sva0']], [CAP]);
  const payload = res.methodResponses?.[0]?.[1];
  if (res.methodResponses?.[0]?.[0] === 'error') {
    throw new Error(payload?.description || "Impossible de modifier l'état d'activation.");
  }
}

export async function deleteSieveScript(accountId: string, scriptId: string): Promise<void> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(accountId, [['SieveScript/set', { accountId: accId, destroy: [scriptId] }, 'svd0']], [CAP]);
  const payload = res.methodResponses?.[0]?.[1];
  if (payload?.notDestroyed?.[scriptId]) {
    throw new Error(payload.notDestroyed[scriptId].description || 'Suppression refusée (désactivez le script avant de le supprimer).');
  }
}
