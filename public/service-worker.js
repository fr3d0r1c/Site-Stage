const CACHE_NAME = 'carnet-stage-v3'; // On change la version pour forcer la mise à jour
const ASSETS_TO_CACHE = [
    '/',
    '/offline.html',
    '/css/style.css',
    '/favicon.ico', // AJOUTÉ : Pour éviter l'erreur favicon
    '/images/logo.png',
    
    // Scripts Locaux
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
    '/js/pwa-init.js'
];

// 1. INSTALLATION
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force l'activation immédiate
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. ACTIVATION (Nettoyage)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim(); // Prend le contrôle des pages immédiatement
});

// 3. INTERCEPTION (Fetch)
self.addEventListener('fetch', (event) => {
    // On ignore les requêtes non-GET (POST, PUT...)
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // A. STRATÉGIE "CACHE FIRST" (Pour les fichiers statiques : CSS, JS, Images, Fonts)
    // On inclut nos fichiers locaux ET les CDNs externes (Google Fonts, FontAwesome...)
    const isStaticAsset = 
        /\.(css|js|png|jpg|jpeg|svg|ico|woff2)$/i.test(url.pathname) ||
        url.hostname.includes('fonts.googleapis') ||
        url.hostname.includes('fonts.gstatic') ||
        url.hostname.includes('cdn.jsdelivr') ||
        url.hostname.includes('unpkg');

    if (isStaticAsset) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                
                // Si pas en cache, on va chercher sur le réseau
                return fetch(event.request).then((networkResponse) => {
                    // Et on met en cache pour la prochaine fois
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                }).catch(() => {
                    // Si échec réseau (offline) sur une ressource statique, on ne fait rien (pas de HTML !)
                    // Cela évite l'erreur "MIME type" dans la console
                    return new Response('', { status: 408, statusText: 'Request timed out' });
                });
            })
        );
        return;
    }

    // B. STRATÉGIE "NETWORK FIRST" (Pour les pages HTML / Navigation)
    // On veut toujours la version la plus récente de l'article
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(async () => {
                // Si réseau échoue (Offline), on cherche dans le cache
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) return cachedResponse;
                
                // Si pas dans le cache, on sert la page "Offline"
                return caches.match('/offline.html');
            })
        );
    }
});