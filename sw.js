// Service Worker for Bitcoin POS - enables offline functionality
const CACHE_NAME = 'btcpos-v1';

// Files to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './bootstrap.js',
    './manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            // Activate immediately without waiting
            return self.skipWaiting();
        })
    );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => {
            // Take control of all clients immediately
            return self.clients.claim();
        })
    );
});

// Fetch: cache-first for app assets, network-first for API calls
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip cross-origin requests (Boltz API, exchange rates, etc.)
    if (url.origin !== self.location.origin) {
        return;
    }

    // Skip webpack dev server hot-update files
    if (url.pathname.includes('hot-update') || url.pathname.includes('.hot-update.')) {
        return;
    }

    // Skip websocket requests
    if (event.request.url.startsWith('ws://') || event.request.url.startsWith('wss://')) {
        return;
    }

    // For same-origin requests: try cache first, fall back to network
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            // Not in cache - fetch from network and cache it
            return fetch(event.request).then((networkResponse) => {
                // Don't cache non-successful responses
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }

                // Clone the response since it can only be consumed once
                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            });
        })
    );
});

