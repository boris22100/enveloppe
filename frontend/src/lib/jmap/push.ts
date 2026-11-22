import { getSession, jmapCall } from './client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function enableWebPush(accountId: string): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web Push non supporté par ce navigateur (HTTPS requis).');
  }

  // 1. Récupère la clé VAPID exposée par Stalwart, sinon fallback sur .env
  const session = await getSession(accountId);
  const vapidKey =
    session.capabilities?.['urn:ietf:params:jmap:webpush-vapid']?.applicationServerKey ||
    import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!vapidKey) {
    throw new Error('Aucune clé VAPID exposée par Stalwart ni définie dans VITE_VAPID_PUBLIC_KEY (.env).');
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permission de notification refusée.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
  }

  await jmapCall(accountId, [[
    'PushSubscription/set',
    {
      create: {
        sub1: {
          deviceClientId: `enveloppe-${navigator.userAgent.slice(0, 24)}`,
          url: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64Url(sub.getKey('p256dh')),
            auth: arrayBufferToBase64Url(sub.getKey('auth'))
          },
          types: ['Email', 'Mailbox']
        }
      }
    },
    'p0'
  ]]);

  return 'Notifications Web Push activées sur Stalwart !';
}
