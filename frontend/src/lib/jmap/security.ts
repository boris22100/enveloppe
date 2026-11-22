import { getPrimaryAccountId, jmapCall } from './client';

const CAP = 'urn:stalwart:jmap';

export interface AppPassword {
  id: string;
  description?: string;
  expiresAt?: string | null;
}

export async function fetchAppPasswords(accountId: string): Promise<AppPassword[]> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(
    accountId,
    [
      ['x:AppPassword/query', { accountId: accId, limit: 50, calculateTotal: true, position: 0 }, 'q0'],
      [
        'x:AppPassword/get',
        { accountId: accId, '#ids': { resultOf: 'q0', name: 'x:AppPassword/query', path: '/ids' } },
        'g0'
      ]
    ],
    [CAP]
  );
  return res.methodResponses?.[1]?.[1]?.list ?? [];
}

export async function createAppPassword(accountId: string, description: string): Promise<string> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(
    accountId,
    [['x:AppPassword/set', { accountId: accId, create: { c1: { description } } }, 's0']],
    [CAP]
  );
  const result = res.methodResponses?.[0]?.[1];
  if (result?.notCreated?.c1) {
    throw new Error(result.notCreated.c1.description || result.notCreated.c1.type || 'Création refusée par Stalwart');
  }
  const created = result?.created?.c1 ?? {};
  return created.secret || created.password || created.token || JSON.stringify(created);
}

export async function deleteAppPassword(accountId: string, id: string): Promise<void> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(
    accountId,
    [['x:AppPassword/set', { accountId: accId, destroy: [id] }, 'd0']],
    [CAP]
  );
  const result = res.methodResponses?.[0]?.[1];
  if (result?.notDestroyed?.[id]) {
    throw new Error(result.notDestroyed[id].description || 'Suppression refusée');
  }
}

export async function updateAccountPassword(accountId: string, currentPassword: string, newPassword: string): Promise<void> {
  const accId = await getPrimaryAccountId(accountId, CAP);
  const res = await jmapCall(
    accountId,
    [[
      'x:AccountPassword/set',
      {
        accountId: accId,
        update: {
          singleton: {
            currentSecret: currentPassword,
            secret: newPassword
          }
        }
      },
      'p0'
    ]],
    [CAP]
  );
  const respName = res.methodResponses?.[0]?.[0];
  const result = res.methodResponses?.[0]?.[1];
  if (respName === 'error') {
    throw new Error(`Erreur JMAP Stalwart (${result?.type || 'unknown'}) : ${result?.description || 'méthode non reconnue'}`);
  }
  if (result?.notUpdated) {
    const err = Object.values(result.notUpdated)[0] as any;
    throw new Error(err?.description || err?.type || 'Modification refusée par Stalwart');
  }
}
