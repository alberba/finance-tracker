/**
 * Limitador de uso en memoria con ventana fija por clave (#340 [D8]).
 *
 * Vive en el proceso, como el que tenía el alta de reportes: no pretende ser un
 * límite distribuido, solo frenar ráfagas de una misma cuenta. La ventana se
 * abre con la primera llamada de la clave y no se desliza; al caducar, la clave
 * vuelve a empezar. Las claves caducadas se purgan para que el mapa no crezca
 * sin límite en un proceso de larga vida.
 */

export interface RateLimiterOptions {
  windowMs: number
  max: number
  now?: () => number
}

export interface RateLimiter {
  /** `true` si la llamada entra en la ventana; `false` si hay que rechazarla. */
  consume: (key: string) => boolean
  /** Claves vivas en memoria; diagnóstico y prueba de la purga. */
  size: () => number
}

interface Bucket {
  count: number
  windowStart: number
}

/** A partir de este tamaño se recorren las claves caducadas y se descartan. */
const SWEEP_THRESHOLD = 1_000

export function createRateLimiter({
  windowMs,
  max,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>()

  function prune(currentTime: number): void {
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.windowStart > windowMs) buckets.delete(key)
    }
  }

  return {
    consume(key: string): boolean {
      const currentTime = now()
      if (buckets.size >= SWEEP_THRESHOLD) prune(currentTime)
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
    size(): number {
      return buckets.size
    },
  }
}

/** Alta de reportes: 5 por minuto, igual que antes de #340. */
export const reportSubmissionLimiter = createRateLimiter({ windowMs: 60_000, max: 5 })

/** Escrituras de aclaraciones: 10 por minuto y cuenta. */
export const reportCommentLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })

/**
 * Lectura de la lista: 30 por minuto y cuenta. La primera página escanea el
 * hilo entero de todas las filas para calcular los avisos ([D6]), así que una
 * ráfaga puede multiplicar las consultas a GitHub aunque el detalle siga sin
 * límite propio (una sola issue por carga).
 */
export const reportListLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })
