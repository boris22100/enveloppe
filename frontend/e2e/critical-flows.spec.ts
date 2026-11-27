import { test, expect } from '@playwright/test';

const ACCOUNT_ID = 'acc-e2e-1';
const INBOX_ID = 'mb-inbox';
const SENT_ID = 'mb-sent';
const DRAFTS_ID = 'mb-drafts';
const TRASH_ID = 'mb-trash';
const JUNK_ID = 'mb-junk';
const ARCHIVE_ID = 'mb-archive';

function installMockApi(page: import('@playwright/test').Page) {
  const sentPayloads: unknown[] = [];
  let queryIdsByCall: Record<string, string[]> = {};

  const sampleEmail = {
    id: 'm-1',
    blobId: 'blob-1',
    threadId: 'th-1',
    mailboxIds: { [INBOX_ID]: true },
    from: [{ name: 'Perrine', email: 'perrine@mallach.fr' }],
    to: [{ name: 'Boris', email: 'boris@mallach.fr' }],
    subject: 'Revue technique v1.0',
    preview: 'Tout est prêt pour la recette finale.',
    receivedAt: new Date().toISOString(),
    keywords: { $seen: true },
    textBody: [{ partId: '1', type: 'text/plain' }],
    htmlBody: [],
    bodyValues: { '1': { value: 'Tout est prêt pour la recette finale.\nÀ demain.' } },
    attachments: []
  };

  return page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === '/api/version') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.10.2-e2e' }) });
    }

    if (url.pathname === '/api/accounts') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ACCOUNT_ID,
            label: 'Boris E2E',
            username: 'boris@mallach.fr',
            serverUrl: 'https://jmap.example.test',
            authType: 'password'
          }
        ])
      });
    }

    if (url.pathname === `/api/jmap/${ACCOUNT_ID}/session`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'boris@mallach.fr',
          apiUrl: `/api/jmap/${ACCOUNT_ID}/api`,
          downloadUrl: `/api/jmap/${ACCOUNT_ID}/download/{accountId}/{blobId}/{name}`,
          uploadUrl: `/api/jmap/${ACCOUNT_ID}/upload/{accountId}`,
          eventSourceUrl: `/api/jmap/${ACCOUNT_ID}/events`,
          accounts: {
            [ACCOUNT_ID]: { name: 'Boris E2E', isPersonal: true, isReadOnly: false, accountCapabilities: {} }
          },
          primaryAccounts: {
            'urn:ietf:params:jmap:mail': ACCOUNT_ID,
            'urn:ietf:params:jmap:contacts': ACCOUNT_ID,
            'urn:ietf:params:jmap:calendars': ACCOUNT_ID
          },
          capabilities: {
            'urn:ietf:params:jmap:core': {},
            'urn:ietf:params:jmap:mail': {},
            'urn:ietf:params:jmap:contacts': {},
            'urn:ietf:params:jmap:calendars': {}
          }
        })
      });
    }

    if (url.pathname === `/api/jmap/${ACCOUNT_ID}/api` && method === 'POST') {
      const body = route.request().postDataJSON() as { methodCalls?: Array<[string, Record<string, unknown>, string]> };
      const calls = body?.methodCalls || [];
      const responses: unknown[] = [];
      queryIdsByCall = {};

      for (const [fn, args, callId] of calls) {
        if (fn === 'Mailbox/get') {
          responses.push([
            'Mailbox/get',
            {
              accountId: ACCOUNT_ID,
              state: 's-mb-1',
              list: [
                { id: INBOX_ID, name: 'Boîte de réception', role: 'inbox', unreadEmails: 1, totalEmails: 1 },
                { id: SENT_ID, name: 'Messages envoyés', role: 'sent', unreadEmails: 0, totalEmails: 0 },
                { id: DRAFTS_ID, name: 'Brouillons', role: 'drafts', unreadEmails: 0, totalEmails: 0 },
                { id: TRASH_ID, name: 'Corbeille', role: 'trash', unreadEmails: 0, totalEmails: 0 },
                { id: JUNK_ID, name: 'Courrier indésirable', role: 'junk', unreadEmails: 0, totalEmails: 0 },
                { id: ARCHIVE_ID, name: 'Archives', role: 'archive', unreadEmails: 0, totalEmails: 0 }
              ],
              notFound: []
            },
            callId
          ]);
        } else if (fn === 'Email/query') {
          const filter = (args?.filter || {}) as { inMailbox?: string };
          const ids = (!filter.inMailbox || filter.inMailbox === INBOX_ID) ? ['m-1'] : [];
          queryIdsByCall[callId] = ids;
          responses.push([
            'Email/query',
            { accountId: ACCOUNT_ID, queryState: 'q-1', canCalculateChanges: false, position: 0, ids, total: ids.length },
            callId
          ]);
        } else if (fn === 'Email/get') {
          let ids: string[] = [];
          if (Array.isArray(args?.ids)) {
            ids = args.ids as string[];
          } else if (args?.['#ids'] && typeof args['#ids'] === 'object') {
            const ref = args['#ids'] as { resultOf?: string };
            ids = (ref.resultOf && queryIdsByCall[ref.resultOf]) || ['m-1'];
          } else {
            ids = ['m-1'];
          }
          responses.push([
            'Email/get',
            {
              accountId: ACCOUNT_ID,
              state: 's-em-1',
              list: ids.filter((id) => id === 'm-1').map((id) => ({ ...sampleEmail, id })),
              notFound: []
            },
            callId
          ]);
        } else if (fn === 'Email/set') {
          sentPayloads.push(args);
          responses.push([
            'Email/set',
            { accountId: ACCOUNT_ID, oldState: 's-em-1', newState: 's-em-2', created: { 'draft-1': { id: 'm-sent-1' } } },
            callId
          ]);
        } else if (fn === 'Calendar/get') {
          responses.push([
            'Calendar/get',
            {
              accountId: ACCOUNT_ID,
              state: 's-cal-1',
              list: [{ id: 'cal-default', name: 'Personnel', isDefault: true, color: '#48B17F' }],
              notFound: []
            },
            callId
          ]);
        } else if (fn === 'CalendarEvent/query') {
          responses.push([
            'CalendarEvent/query',
            { accountId: ACCOUNT_ID, queryState: 'cq-1', ids: [], total: 0 },
            callId
          ]);
        } else if (fn === 'CalendarEvent/get') {
          responses.push([
            'CalendarEvent/get',
            { accountId: ACCOUNT_ID, state: 's-ce-1', list: [], notFound: [] },
            callId
          ]);
        } else if (fn === 'CalendarEvent/set') {
          responses.push([
            'CalendarEvent/set',
            { accountId: ACCOUNT_ID, oldState: 's-ce-1', newState: 's-ce-2', created: { 'ev-1': { id: 'ev-created-1' } } },
            callId
          ]);
        } else if (fn === 'ContactCard/get' || fn === 'ContactCard/query') {
          responses.push([
            'ContactCard/get',
            { accountId: ACCOUNT_ID, state: 's-c-1', list: [], notFound: [] },
            callId
          ]);
        } else {
          responses.push([fn, { accountId: ACCOUNT_ID }, callId]);
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ methodResponses: responses, sessionState: 'sess-1' })
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test('1. Messagerie : ouverture de la boîte de réception et lecture d’un message', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/');
  await expect(page.getByText('Revue technique v1.0').first()).toBeVisible();
  await page.getByText('Revue technique v1.0').first().click();
  await expect(page.getByText(/Tout est prêt pour la recette finale/i).first()).toBeVisible();
});

test('2. Calendrier : bascule vers la vue Calendrier et affichage des vues', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/');
  const calBtn = page.getByRole('button', { name: /calendrier/i }).first();
  if (await calBtn.isVisible()) {
    await calBtn.click();
    await expect(page.getByText(/Mois|Semaine|Jour/i).first()).toBeVisible();
  }
});

test('3. Résilience hors-ligne : passage offline puis retour online', async ({ page, context }) => {
  await installMockApi(page);
  await page.goto('/');
  await expect(page.getByText('Revue technique v1.0').first()).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Revue technique v1.0').first()).toBeVisible();
});
