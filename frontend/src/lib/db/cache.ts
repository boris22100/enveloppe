import Dexie, { type Table } from 'dexie';

export interface CachedEmail {
  uid: string; // `${accountId}:${emailId}`
  accountId: string;
  id: string;
  blobId?: string;
  subject: string;
  from: { name?: string; email: string }[];
  receivedAt: string;
  preview: string;
  isUnread: boolean;
  keywords?: Record<string, boolean>;
  htmlBody?: string;
  textBody?: string;
}

class JmapCacheDB extends Dexie {
  emails!: Table<CachedEmail, string>;

  constructor() {
    super('jmap_pulse_cache');
    this.version(1).stores({
      emails: 'uid, accountId, receivedAt'
    });
  }
}

export const db = new JmapCacheDB();
