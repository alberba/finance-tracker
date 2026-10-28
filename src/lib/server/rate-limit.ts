/**
 * Limitador de uso en memoria con ventana deslizante por clave (#340 [D8]).
 *
 * Vive en el proceso, como el que tenía el alta de reportes: no pretende ser un
 * límite distribuido, solo frenar ráfagas de una misma cuenta.
 */

export interface RateLimiterOptions {
  windowMs: number
  max: number
  now?: () => number
}

export interface RateLimiter {
  /** `true` si la llamada entra en la ventana; `false` si hay que rechazarla. */
  consume: (key: string) => boolean
}

interface Bucket {
  count: number
  windowStart: number
}

export function createRateLimiter({
  windowMs,
  max,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>()

  return {
    consume(key: string): boolean {
      const currentTime = now()
      const current = buckets.get(key)
      if (!current || currentTime - current.windowStart > windowMs) {
        buckets.set(key, { count: 1, windowStart: currentTime })
        return true
      }
      if (current.count >= max) return false
      current.count += 1
      buckets.set(key, current)
      return true
    },
  }
}

/** Alta de reportes: 5 por minuto, igual que antes de #340. */
export const reportSubmissionLimiter = createRateLimiter({ windowMs: 60_000, max: 5 })

/** Escrituras de aclaraciones: 10 por minuto y cuenta. */
export const reportCommentLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })
