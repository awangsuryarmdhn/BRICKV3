const CACHE_NAME = 'brickchat-v1';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './manifest.json',
    'https://unpkg.com/nostr-tools/lib/nostr.bundle.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'New Message', content: 'BrickChat notification' };
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.content,
            icon: 'assets/icon-192.png',
            badge: 'assets/icon-192.png'
        })
    );
});
