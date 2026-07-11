/* ============================================================
   BET300 · Service Worker — PWA + Web Push
   Versión: 1.1.6   (bumpear en cada deploy del portal → dispara el aviso "Actualizar")
   ============================================================ */
const CACHE = 'bet300-pwa-v8';
const SHELL = ['/', '/portal.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

// ── Instalación: cachear shell ────────────────────────────────
// OJO: NO llamamos skipWaiting() acá. Así, cuando hay una versión nueva y ya existe un SW
// controlando, el nuevo queda "waiting" y el portal muestra el banner "Actualizar" (el usuario
// decide cuándo). En la PRIMERA instalación (sin SW previo) igual activa al toque (no hay waiting).
self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))
  );
});

// El portal pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', ev => {
  if (ev.data && ev.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Activación: limpiar caches viejos ────────────────────────
self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, fallback a cache ───────────────────
self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET') return;
  if (ev.request.url.includes('/api/')) return; // no cachear API
  ev.respondWith(
    fetch(ev.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(ev.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(ev.request).then(r => r || caches.match('/')))
  );
});

// ── Push notification ─────────────────────────────────────────
self.addEventListener('push', ev => {
  let payload = {
    title: 'BET300',
    body:  'Tenés una novedad.',
    url:   '/',
    tag:   'bet300-general',
    icon:  '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
  };

  try {
    if (ev.data) {
      const d = ev.data.json();
      payload = { ...payload, ...d };
    }
  } catch (_) {}

  ev.waitUntil(
    self.registration.showNotification(payload.title, {
      body:             payload.body,
      icon:             payload.icon  || '/icons/icon-192.png',
      badge:            payload.badge || '/icons/badge-72.png',
      tag:              payload.tag,
      renotify:         true,
      requireInteraction: false,
      vibrate:          [200, 80, 200],
      data:             { url: payload.url },
      actions: payload.actions || [],
    })
  );
});

// ── Click en notificación ─────────────────────────────────────
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const target = ev.notification.data?.url || '/';

  ev.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ── Push subscription change (auto-renovar) ──────────────────
self.addEventListener('pushsubscriptionchange', ev => {
  ev.waitUntil(
    self.registration.pushManager.subscribe(ev.oldSubscription.options)
      .then(sub => {
        return fetch('/api/save-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub, renovacion: true }),
        });
      })
  );
});
