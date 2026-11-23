export interface Account {
  id: string;
  label: string;
  color: string;
  host: string;
  username: string;
}

export interface Mailbox {
  id: string;
  name: string;
  role: string | null;
  parentId: string | null;
  unreadEmails: number;
  sortOrder: number;
  depth?: number;
}

export interface Attachment {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface EmailSummary {
  id: string;
  blobId?: string;
  subject: string;
  from: { name?: string; email: string }[];
  receivedAt: string;
  preview: string;
  keywords: Record<string, boolean>;
  mailboxIds: Record<string, boolean>;
}

const sessionCache = new Map<string, any>();

export async function getSession(accountId: string) {
  if (sessionCache.has(accountId)) return sessionCache.get(accountId);
  const res = await fetch(`/api/jmap/${accountId}/session`);
  if (!res.ok) throw new Error('Session JMAP inaccessible');
  const data = await res.json();
  sessionCache.set(accountId, data);
  return data;
}

export async function getPrimaryAccountId(accountId: string, capability = 'urn:ietf:params:jmap:mail'): Promise<string> {
  const s = await getSession(accountId);
  return s.primaryAccounts?.[capability] ?? Object.values(s.primaryAccounts)[0];
}

export async function jmapCall(accountId: string, methodCalls: any[], extraCapabilities: string[] = []) {
  const using = Array.from(new Set([
    'urn:ietf:params:jmap:core',
    'urn:ietf:params:jmap:mail',
    'urn:ietf:params:jmap:submission',
    ...extraCapabilities
  ]));
  const res = await fetch(`/api/jmap/${accountId}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ using, methodCalls })
  });
  if (!res.ok) throw new Error(`Erreur JMAP ${res.status}`);
  return res.json();
}

const ROLE_ORDER: Record<string, number> = {
  inbox: 1,
  drafts: 2,
  sent: 3,
  archive: 4,
  junk: 5,
  trash: 6
};

export const ROLE_META: Record<string, { label: string; icon: string }> = {
  inbox: { label: 'Boîte de réception', icon: '📥' },
  drafts: { label: 'Brouillons', icon: '📝' },
  sent: { label: 'Envoyés', icon: '📤' },
  archive: { label: 'Archives', icon: '🗄️' },
  junk: { label: 'Indésirables', icon: '🚫' },
  trash: { label: 'Corbeille', icon: '🗑️' }
};

export function buildMailboxTree(list: Mailbox[]): Mailbox[] {
  const byParent = new Map<string | null, Mailbox[]>();
  for (const box of list) {
    const key = box.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(box);
  }
  const result: Mailbox[] = [];
  function walk(parentId: string | null, depth: number) {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => {
      const ra = a.role ? (ROLE_ORDER[a.role] ?? 50) : 99;
      const rb = b.role ? (ROLE_ORDER[b.role] ?? 50) : 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, 'fr');
    });
    for (const c of children) {
      result.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export function getMailboxSubtreeIds(mailboxes: Mailbox[], rootId: string): string[] {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const box of mailboxes) {
      if (box.parentId === current && !ids.includes(box.id)) {
        ids.push(box.id);
        queue.push(box.id);
      }
    }
  }
  return ids;
}

export async function fetchMailboxes(accountId: string): Promise<Mailbox[]> {
  const accId = await getPrimaryAccountId(accountId);
  const res = await jmapCall(accountId, [[
    'Mailbox/get',
    { accountId: accId, properties: ['id', 'name', 'role', 'parentId', 'unreadEmails', 'sortOrder'] },
    'm0'
  ]]);
  return buildMailboxTree(res.methodResponses[0][1].list ?? []);
}

export async function fetchMailboxEmails(accountId: string, mailboxId: string): Promise<EmailSummary[]> {
  const accId = await getPrimaryAccountId(accountId);
  const mailRes = await jmapCall(accountId, [
    ['Email/query', { accountId: accId, filter: { inMailbox: mailboxId }, sort: [{ property: 'receivedAt', isAscending: false }], limit: 50 }, 'q0'],
    ['Email/get', { accountId: accId, '#ids': { resultOf: 'q0', name: 'Email/query', path: '/ids' }, properties: ['id', 'blobId', 'subject', 'from', 'receivedAt', 'preview', 'keywords', 'mailboxIds'] }, 'g0']
  ]);
  return (mailRes.methodResponses[1][1].list ?? []) as EmailSummary[];
}

export async function fetchEmailBody(accountId: string, emailId: string) {
  const accId = await getPrimaryAccountId(accountId);
  const res = await jmapCall(accountId, [
    ['Email/get', { accountId: accId, ids: [emailId], properties: ['id', 'htmlBody', 'textBody', 'bodyValues', 'attachments'], fetchHTMLBodyValues: true, fetchTextBodyValues: true }, 'b0'],
    ['Email/set', { accountId: accId, update: { [emailId]: { 'keywords/$seen': true } } }, 'b1']
  ]);
  const msg = res.methodResponses[0][1].list[0];
  const htmlPartId = msg.htmlBody?.[0]?.partId;
  const textPartId = msg.textBody?.[0]?.partId;
  return {
    jmapAccountId: accId,
    html: htmlPartId ? msg.bodyValues[htmlPartId]?.value : null,
    text: textPartId ? msg.bodyValues[textPartId]?.value : '',
    attachments: (msg.attachments ?? []) as Attachment[]
  };
}

export async function uploadAttachment(accountId: string, file: File): Promise<Attachment> {
  const accId = await getPrimaryAccountId(accountId);
  const res = await fetch(`/api/jmap/${accountId}/upload/${encodeURIComponent(accId)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
  if (!res.ok) throw new Error('Échec upload pièce jointe');
  const data = await res.json();
  return { blobId: data.blobId, name: file.name, type: file.type || 'application/octet-stream', size: data.size };
}

export function getDownloadUrl(accountId: string, jmapAccountId: string, att: Attachment) {
  return `/api/jmap/${accountId}/download/${encodeURIComponent(jmapAccountId)}/${encodeURIComponent(att.blobId)}/${encodeURIComponent(att.name || 'fichier')}?type=${encodeURIComponent(att.type)}`;
}

export async function archiveEmail(accountId: string, emailId: string, currentMailboxId: string, archiveId?: string) {
  const accId = await getPrimaryAccountId(accountId);
  const update: Record<string, any> = { [`mailboxIds/${currentMailboxId}`]: null };
  if (archiveId) update[`mailboxIds/${archiveId}`] = true;
  await jmapCall(accountId, [['Email/set', { accountId: accId, update: { [emailId]: update } }, 'a0']]);
}

export async function sendEmail(accountId: string, toEmail: string, subject: string, textBody: string, attachments: Attachment[] = []) {
  const accId = await getPrimaryAccountId(accountId);
  const meta = await jmapCall(accountId, [
    ['Identity/get', { accountId: accId }, 'i0'],
    ['Mailbox/get', { accountId: accId, properties: ['id', 'role'] }, 'm0']
  ]);
  const identity = meta.methodResponses[0][1].list[0];
  const mailboxes = meta.methodResponses[1][1].list as { id: string; role?: string }[];
  const drafts = mailboxes.find((m) => m.role === 'drafts') ?? mailboxes[0];
  const sent = mailboxes.find((m) => m.role === 'sent');

  await jmapCall(accountId, [
    [
      'Email/set',
      {
        accountId: accId,
        create: {
          draft1: {
            mailboxIds: { [drafts.id]: true },
            from: [{ name: identity.name, email: identity.email }],
            to: [{ email: toEmail }],
            subject,
            keywords: { $draft: true, $seen: true },
            bodyValues: { body: { value: textBody } },
            textBody: [{ partId: 'body', type: 'text/plain' }],
            ...(attachments.length ? { attachments: attachments.map((a) => ({ blobId: a.blobId, name: a.name, type: a.type })) } : {})
          }
        }
      },
      's0'
    ],
    [
      'EmailSubmission/set',
      {
        accountId: accId,
        create: { sub1: { identityId: identity.id, emailId: '#draft1' } },
        onSuccessUpdateEmail: {
          '#sub1': { [`mailboxIds/${drafts.id}`]: null, ...(sent ? { [`mailboxIds/${sent.id}`]: true } : {}), 'keywords/$draft': null }
        }
      },
      's1'
    ]
  ]);
}

export interface DiskQuota {
  used: number;
  limit: number;
  percent: number;
}

export async function fetchQuota(accountId: string): Promise<DiskQuota | null> {
  try {
    const accId = await getPrimaryAccountId(accountId);
    const res = await jmapCall(
      accountId,
      [['Quota/get', { accountId: accId }, 'q0']],
      ['urn:ietf:params:jmap:quota']
    );
    const list = res.methodResponses?.[0]?.[1]?.list as any[] | undefined;
    if (!list?.length) return null;
    const storage = list.find((q) => q.resourceType === 'octets') ?? list[0];
    const used = Number(storage.used ?? 0);
    const limit = Number(storage.hardLimit ?? storage.limit ?? 0);
    if (!limit) return null;
    return {
      used,
      limit,
      percent: Math.min(100, Math.round((used / limit) * 100))
    };
  } catch {
    return null;
  }
}

export async function updateEmailMailbox(accountId: string, emailId: string, targetMailboxId: string) {
  const accId = await getPrimaryAccountId(accountId);
  await jmapCall(accountId, [[
    'Email/set',
    { accountId: accId, update: { [emailId]: { mailboxIds: { [targetMailboxId]: true } } } },
    'mv0'
  ]]);
}

export async function destroyEmail(accountId: string, emailId: string) {
  const accId = await getPrimaryAccountId(accountId);
  await jmapCall(accountId, [['Email/set', { accountId: accId, destroy: [emailId] }, 'rm0']]);
}

export async function setEmailKeyword(accountId: string, emailId: string, keyword: string, value: boolean) {
  const accId = await getPrimaryAccountId(accountId);
  await jmapCall(accountId, [[
    'Email/set',
    { accountId: accId, update: { [emailId]: { [`keywords/${keyword}`]: value ? true : null } } },
    'kw0'
  ]]);
}

export async function markMailboxesAsRead(accountId: string, mailboxIds: string[]): Promise<number> {
  const accId = await getPrimaryAccountId(accountId);
  let total = 0;
  for (const mbId of mailboxIds) {
    while (true) {
      const qRes = await jmapCall(accountId, [[
        'Email/query',
        { accountId: accId, filter: { inMailbox: mbId, notKeyword: '$seen' }, limit: 200 },
        'qr0'
      ]]);
      const ids: string[] = qRes.methodResponses?.[0]?.[1]?.ids ?? [];
      if (ids.length === 0) break;

      const update: Record<string, any> = {};
      for (const id of ids) update[id] = { 'keywords/$seen': true };

      const sRes = await jmapCall(accountId, [['Email/set', { accountId: accId, update }, 'sr0']]);
      const updatedCount = Object.keys(sRes.methodResponses?.[0]?.[1]?.updated ?? {}).length;
      total += updatedCount;
      if (updatedCount === 0 || ids.length < 200) break;
    }
  }
  return total;
}

export async function emptyMailboxes(accountId: string, mailboxIds: string[]): Promise<number> {
  const accId = await getPrimaryAccountId(accountId);
  let total = 0;
  for (const mbId of mailboxIds) {
    while (true) {
      const qRes = await jmapCall(accountId, [[
        'Email/query',
        { accountId: accId, filter: { inMailbox: mbId }, limit: 200 },
        'qe0'
      ]]);
      const ids: string[] = qRes.methodResponses?.[0]?.[1]?.ids ?? [];
      if (ids.length === 0) break;

      const sRes = await jmapCall(accountId, [['Email/set', { accountId: accId, destroy: ids }, 'se0']]);
      const destroyed: string[] = sRes.methodResponses?.[0]?.[1]?.destroyed ?? [];
      total += destroyed.length;
      if (destroyed.length === 0 || ids.length < 200) break;
    }
  }
  return total;
}

export async function createMailbox(accountId: string, name: string, parentId: string | null = null) {
  const accId = await getPrimaryAccountId(accountId);
  await jmapCall(accountId, [[
    'Mailbox/set',
    { accountId: accId, create: { mb1: { name, parentId } } },
    'mbc0'
  ]]);
}

export async function renameMailbox(accountId: string, mailboxId: string, name: string) {
  const accId = await getPrimaryAccountId(accountId);
  await jmapCall(accountId, [[
    'Mailbox/set',
    { accountId: accId, update: { [mailboxId]: { name } } },
    'mbr0'
  ]]);
}

export async function deleteMailbox(accountId: string, mailboxId: string) {
  const accId = await getPrimaryAccountId(accountId);
  await jmapCall(accountId, [[
    'Mailbox/set',
    { accountId: accId, destroy: [mailboxId], onDestroyRemoveEmails: false },
    'mbd0'
  ]]);
}
