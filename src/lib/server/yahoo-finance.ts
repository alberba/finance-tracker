import YahooFinance from 'yahoo-finance2'

export class YahooFinanceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`Yahoo Finance respondió ${status}`)
    this.name = 'YahooFinanceHttpError'
  }
}

// Reuse the SDK's cookie/crumb session and request queue across quotes and searches.
// Check HTTP failures before the SDK parses them so Retry-After survives its error handling.
export const yahooFinance = new YahooFinance({
  versionCheck: false,
  suppressNotices: ['yahooSurvey'],
  queue: { concurrency: 2 },
  fetch: async (input, init) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal
    try {
      const response = await fetch(input, { ...init, signal })
      // The SDK follows manual 3xx responses during its cookie/consent handshake.
      if (response.status >= 400) {
        const retryAfter = response.headers.get('Retry-After')
        const seconds = retryAfter === null ? NaN : Number(retryAfter)
        const retryAt = retryAfter === null ? NaN : Date.parse(retryAfter)
        const retryAfterMs = Number.isFinite(seconds)
          ? Math.max(0, seconds * 1_000)
          : Number.isFinite(retryAt)
            ? Math.max(0, retryAt - Date.now())
            : null
        throw new YahooFinanceHttpError(response.status, retryAfterMs)
      }
      return response
    } finally {
      clearTimeout(timeout)
    }
  },
})
