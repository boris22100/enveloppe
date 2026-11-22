/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

console.debug('SW manifest', (self as any).__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Requis par certains navigateurs pour valider l'installabilité PWA
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let title = 'Enveloppe';
  let body = 'Nouvelle activité sur votre messagerie.';
  if (event.data) {
    try {
      const data = event.data.json();
      if (data['@type'] === 'StateChange') body = 'Vous avez reçu un nouveau message.';
    } catch {
      body = event.data.text();
    }
  }
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/pwa-192.png', badge: '/pwa-192.png' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
