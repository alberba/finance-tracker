import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The service worker serves the self-hosted fonts offline (#404). Static assets
 * may answer `Vary: Origin`; the request that fills the cache and the CORS font
 * fetch that reads it need not carry the same headers, so a plain `match` misses.
 * This runs public/sw.js with a cache that honours `Vary` like the real one.
 */

const serviceWorkerSource = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
const ORIGIN = 'https://app.test'

type QueryOptions = { ignoreVary?: boolean }

class MemoryCache {
  private entries = new Map<string, { request: Request; response: Response }>()

  async match(request: Request, options: QueryOptions = {}): Promise<Response | undefined> {
    const entry = this.entries.get(request.url)
    if (!entry) return undefined
    if (!options.ignoreVary) {
      const vary = entry.response.headers.get('vary')
      for (const name of vary?.split(',').map((value) => value.trim().toLowerCase()) ?? []) {
        if (entry.request.headers.get(name) !== request.headers.get(name)) return undefined
      }
    }
    return entry.response.clone()
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, { request, response: response.clone() })
  }

  async addAll(requests: string[]): Promise<void> {
    for (const path of requests) {
      const request = new Request(new URL(path, ORIGIN))
      await this.put(request, await fetch(request))
    }
  }
}

type FetchEventLike = {
  request: Request
  respondWith: (response: Promise<Response>) => void
}

function startServiceWorker() {
  const listeners = new Map<string, (event: FetchEventLike) => void>()
  const cache = new MemoryCache()

  vi.stubGlobal('self', {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (event: FetchEventLike) => void) =>
      listeners.set(type, handler),
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
  })
  vi.stubGlobal('caches', {
    open: async () => cache,
    keys: async () => [],
    delete: async () => true,
  })

  new Function(serviceWorkerSource)()
  return listeners
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('service worker font cache', () => {
  it('returns a cached font when the stored response varies on Origin', async () => {
    const listeners = startServiceWorker()
    const url = `${ORIGIN}/fonts/syne-latin-wght.woff2`
    const cache = await caches.open('finance-tracker-v4')

    // `cache.addAll` stores a request without Origin; the page later fetches
    // the font in CORS mode with one.
    await cache.put(
      new Request(url),
      new Response('syne-bytes', { headers: { 'Content-Type': 'font/woff2', Vary: 'Origin' } }),
    )
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline')
    })

    let response: Promise<Response> | undefined
    listeners.get('fetch')?.({
      request: new Request(url, { headers: { Origin: ORIGIN } }),
      respondWith: (promise: Promise<Response>) => {
        response = promise
      },
    })

    expect(response).toBeDefined()
    await expect(response!.then((value) => value.text())).resolves.toBe('syne-bytes')
  })
})
