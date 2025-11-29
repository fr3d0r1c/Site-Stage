const CACHE_NAME = 'carnet-stage-v6'; // INC: Changez ce numéro à chaque grosse mise à jour
const ASSETS_TO_CACHE = [
    '/',
    '/offline.html',
    '/css/style.css',
    '/favicon.ico',
    '/images/logo.png',
    
    // Scripts JS
    '/js/main.js',
    '/js/theme-switcher.js',
    '/js/preloader.js',
    '/js/swal-handler.js',
    '/js/konami.js',
    '/js/zen-mode.js',
    '/js/likes.js',
    '/js/lightbox.js',
    '/js/comment-reply.js',
    '/js/guest-memory.js',
    '/js/live-search.js',
    '/js/map.js',
    '/js/share.js',
    '/js/toc.js',
    '/js/pwa-init.js',
    '/js/syntax-highlight.js', // N'oubliez pas celui-ci
    '/js/reading-tools.js'     // Et celui-ci
];

// 1. INSTALLATION
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force l'activation immédiate du nouveau SW
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. ACTIVATION (Nettoyage des vieux caches)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Suppression ancien cache:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim(); // Prend le contrôle immédiatement
});

// 3. INTERCEPTION (Stratégie Hybride)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    if (!url.protocol.startsWith('http')) return;

    const isCritical =
        event.request.mode === 'navigate' ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js');

    if (isCritical) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedResponse = await caches.match(event.request);
                    if (cachedResponse) return cachedResponse;
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return fetch(event.request).then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            }).catch(() => {
                return new Response('', { status: 408, statusText: 'Request timed out' });
            });
        })
    );
});