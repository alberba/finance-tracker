const CACHE_VERSION = 'finance-tracker-v3'
const APP_SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/apple-touch-icon.png',
  '/icons/pwa-192.png',
  '/icons/pwa-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/login'
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_RESOURCE_URLS' || !Array.isArray(event.data.urls)) {
    return
  }

  event.waitUntil(cacheResourceUrls(event.data.urls))
})

async function cacheResourceUrls(urls) {
  const cache = await caches.open(CACHE_VERSION)
  const sameOriginUrls = [...new Set(urls)]
    .slice(0, 100)
    .map((value) => new URL(value, self.location.origin))
    .filter(
      (url) =>
        url.origin === self.location.origin &&
        !url.pathname.startsWith('/api/') &&
        url.pathname !== '/login' &&
        !url.searchParams.has('invitation'),
    )

  await Promise.allSettled(
    sameOriginUrls.map(async (url) => {
      const request = new Request(url, { credentials: 'same-origin' })
      if (await cache.match(request)) {
        return
      }
      const response = await fetch(request)
      if (response.ok && !response.redirected) {
        await cache.put(request, response)
      }
    }),
  )
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION)
  try {
    const response = await fetch(request)
    if (response.ok && !response.redirected) {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return (await cache.match(request)) || (await cache.match('/'))
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && !response.redirected) {
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  return cached || (await network) || Response.error()
}
