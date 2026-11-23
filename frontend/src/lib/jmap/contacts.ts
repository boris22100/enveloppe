import { getPrimaryAccountId, jmapCall } from './client';

const CAP = 'urn:ietf:params:jmap:contacts';

export interface JSContact {
  id?: string;
  name?: { full?: string };
  emails?: Record<string, { address: string }>;
  phones?: Record<string, { number: string }>;
}

export async function fetchContacts(accountId: string): Promise<JSContact[]> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(accountId, [['ContactCard/get', { accountId: accId }, 'c0']], [CAP]);
  return res.methodResponses[0][1].list ?? [];
}

export async function createContact(accountId: string, fullName: string, email: string, phone = '') {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const card: any = {
    '@type': 'Card',
    version: '1.0',
    name: { full: fullName },
    emails: { e1: { '@type': 'EmailAddress', address: email } }
  };
  if (phone) card.phones = { p1: { '@type': 'Phone', number: phone } };
  await jmapCall(accountId, [['ContactCard/set', { accountId: accId, create: { c1: card } }, 'c0']], [CAP]);
}

export async function deleteContact(accountId: string, contactId: string) {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(accountId, [['ContactCard/set', { accountId: accId, destroy: [contactId] }, 'cd0']], [CAP]);
  const result = res.methodResponses?.[0]?.[1];
  if (result?.notDestroyed?.[contactId]) {
    throw new Error(result.notDestroyed[contactId].description || 'Suppression du contact refusée');
  }
}

export async function importContactsJSON(accountId: string, jsonText: string) {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const items = JSON.parse(jsonText) as any[];
  const create: Record<string, any> = {};
  items.forEach((item, idx) => {
    const { id, uid, ...clean } = item;
    create['imp_' + idx] = { '@type': 'Card', version: '1.0', ...clean };
  });
  await jmapCall(accountId, [['ContactCard/set', { accountId: accId, create }, 'imp0']], [CAP]);
}
