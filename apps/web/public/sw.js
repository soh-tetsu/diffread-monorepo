// Custom Service Worker for Diffread
// Manually configured to prefetch critical resources for fast share-target loading

const APP_VERSION = '0.3.5' // Updated during build
const CACHE_VERSION = `diffread-v${APP_VERSION}`
const RUNTIME_CACHE = `diffread-runtime-v${APP_VERSION}`

// Critical resources to prefetch on install
// These will be available immediately on share-target
const PREFETCH_URLS = ['/', '/share-confirm', '/bookmarks', '/manifest.json']

// Install event - prefetch critical resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v1...')

  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => {
        console.log('[SW] Prefetching critical resources:', PREFETCH_URLS)
        return cache.addAll(PREFETCH_URLS)
      })
      .then(() => {
        console.log('[SW] All critical resources cached')
        return self.skipWaiting() // Activate immediately
      })
      .catch((err) => {
        console.error('[SW] Prefetch failed:', err)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_VERSION && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
            return Promise.resolve()
          })
        )
      })
      .then(() => {
        console.log('[SW] Taking control of all clients')
        return self.clients.claim()
      })
  )
})

// Fetch event - Cache-First strategy with runtime caching
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return
  }

  // Skip API routes - always fetch fresh
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )
    return
  }

  // Cache-First strategy for all other resources
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[SW] Cache hit:', url.pathname)
        return cachedResponse
      }

      // Not in cache - fetch and cache it
      console.log('[SW] Cache miss, fetching:', url.pathname)
      return fetch(request)
        .then((networkResponse) => {
          // Only cache successful responses
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse
          }

          // Clone the response
          const responseToCache = networkResponse.clone()

          // Cache in runtime cache
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache)
          })

          return networkResponse
        })
        .catch((err) => {
          console.error('[SW] Fetch failed:', url.pathname, err)

          // Return offline fallback if available
          return caches.match('/offline').then((offlineResponse) => {
            return offlineResponse || new Response('Offline', { status: 503 })
          })
        })
    })
  )
})

// Message event - for manual cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'PREFETCH_URLS') {
    const urls = event.data.urls || []
    caches.open(RUNTIME_CACHE).then((cache) => {
      cache.addAll(urls)
      console.log('[SW] Prefetched additional URLs:', urls)
    })
  }
})
