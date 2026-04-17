const CACHE_NAME = 'zev-cache-v2';

const ASSETS_TO_CACHE = [
'./',
'./index.html',
'./style.css',
'./script.js',
'./manifest.json',
'./icon-192.png',
'./icon-512.png'
];

// Install
self.addEventListener('install', (event) => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => cache.addAll(ASSETS_TO_CACHE))
.then(() => self.skipWaiting())
);
});

// Activate
self.addEventListener('activate', (event) => {
event.waitUntil(
caches.keys().then((cacheNames) => {
return Promise.all(
cacheNames.map((cacheName) => {
if (cacheName !== CACHE_NAME) {
return caches.delete(cacheName);
}
})
);
}).then(() => self.clients.claim())
);
});

// Fetch (FIXED STRATEGY)
self.addEventListener('fetch', (event) => {
// HTML → always fresh (no stale UI)
if (event.request.mode === 'navigate') {
event.respondWith(
fetch(event.request)
.catch(() => caches.match('./index.html'))
);
return;
}

// Static assets → cache first
event.respondWith(
caches.match(event.request)
.then((response) => {
return response || fetch(event.request);
})
);
});
