import Decimal from 'decimal.js'
import { Data, Duration, Effect, Schedule, Schema } from 'effect'
import type { RemoteOperation, SkippedOperation } from '../../bitvavo-types'
import { Http } from '../http'

export class InvalidCredential extends Data.TaggedError('InvalidCredential')<{ message: string }> {}
export class RateLimit extends Data.TaggedError('RateLimit')<{
  message: string
  retryAfterMs: number
}> {}
export class ProviderError extends Data.TaggedError('ProviderError')<{
  message: string
  retryable: boolean
}> {}
export class NonEuroOperation extends Data.TaggedError('NonEuroOperation')<{ message: string }> {}
export type ClientError = InvalidCredential | RateLimit | ProviderError

const Exact = Decimal.clone({ precision: 100 })
const decimal = Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?$/), Schema.isMaxLength(40))
const transaction = Schema.Struct({
  transactionId: Schema.String.check(Schema.isMinLength(1)),
  executedAt: Schema.String,
  type: Schema.Literals(['buy', 'sell']),
  priceCurrency: Schema.String,
  priceAmount: decimal,
  sentCurrency: Schema.String,
  sentAmount: decimal,
  receivedCurrency: Schema.String,
  receivedAmount: decimal,
  feesCurrency: Schema.String,
  feesAmount: decimal,
})
const pageSchema = Schema.Struct({
  items: Schema.Array(Schema.Unknown),
  currentPage: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  totalPages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

export interface BitvavoCredentials {
  apiKey: string
  apiSecret: string
}
export interface HistoryRange {
  from: number
  to: number
  timeZone: string
  startDate?: string
}

async function sign(secret: string, timestamp: string, path: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}GET${path}`))
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function retryDelay(value: string | null): number {
  if (!value) return 1000
  const seconds = Number(value)
  return (
    Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()) || 1000
  )
}

const requestPage = Effect.fnUntraced(function* (
  credentials: BitvavoCredentials,
  range: HistoryRange,
  page: number,
) {
  const http = yield* Http
  const query = new URLSearchParams({
    fromDate: String(range.from),
    toDate: String(range.to),
    page: String(page),
    maxItems: '100',
  })
  const path = `/v2/account/history?${query}`
  const timestamp = String(Date.now())
  const signature = yield* Effect.tryPromise({
    try: () => sign(credentials.apiSecret, timestamp, path),
    catch: () => new InvalidCredential({ message: 'Credenciales inválidas.' }),
  })
  const result = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await http.request(`https://api.bitvavo.com${path}`, {
        method: 'GET',
        // workerd rejects `redirect: 'error'`; a redirect is refused below instead.
        redirect: 'manual',
        signal,
        headers: {
          'Bitvavo-Access-Key': credentials.apiKey,
          'Bitvavo-Access-Signature': signature,
          'Bitvavo-Access-Timestamp': timestamp,
          'Bitvavo-Access-Window': '10000',
        },
      })
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
        throw new ProviderError({ message: 'Bitvavo redirigió la consulta.', retryable: false })
      if (response.status === 401 || response.status === 403)
        throw new InvalidCredential({ message: 'Comprueba la clave y su permiso de lectura.' })
      if (response.status === 429) {
        const resetAt = Number(response.headers.get('bitvavo-ratelimit-resetat'))
        throw new RateLimit({
          message: 'Bitvavo ha limitado las consultas.',
          retryAfterMs: Math.max(
            retryDelay(response.headers.get('Retry-After')),
            Number.isFinite(resetAt) ? resetAt - Date.now() : 0,
          ),
        })
      }
      if (!response.ok)
        throw new ProviderError({
          message: 'Bitvavo no pudo devolver el historial.',
          retryable: response.status >= 500,
        })
      try {
        return await response.json()
      } catch {
        throw new ProviderError({ message: 'Respuesta inválida de Bitvavo.', retryable: false })
      }
    },
    catch: (error) =>
      error instanceof InvalidCredential ||
      error instanceof RateLimit ||
      error instanceof ProviderError
        ? error
        : new ProviderError({ message: 'No se pudo contactar con Bitvavo.', retryable: true }),
  })
  return yield* Schema.decodeUnknownEffect(pageSchema)(result).pipe(
    Effect.mapError(
      () => new ProviderError({ message: 'Paginación inválida de Bitvavo.', retryable: false }),
    ),
  )
})

const retrySchedule = Schedule.exponential('250 millis').pipe(
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(
      input instanceof RateLimit
        ? Math.max(Duration.toMillis(duration), input.retryAfterMs)
        : duration,
    ),
  ),
)

/**
 * Local date and time of a remote UTC instant in an IANA zone. Always derived
 * from the instant, so a zone change can rematerialize them (midnight and DST).
 */
export function localDateTime(instant: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}:${part('second')}`,
  }
}

/**
 * Bitvavo serializes some amounts from binary floats (`9.969987463999999` for
 * 0.0063208 × 1577.33 = 9.969987464). A relative difference below 1e-12 is that
 * noise, far from any cent; anything larger is a real inconsistency.
 */
const FLOAT_NOISE = new Exact('1e-12')
function matchesGross(gross: Decimal, expected: Decimal): boolean {
  return gross.minus(expected).abs().lte(expected.abs().times(FLOAT_NOISE))
}

function readOperation(input: unknown, range: HistoryRange): RemoteOperation {
  const row = Schema.decodeUnknownSync(transaction)(input)
  if (row.priceCurrency !== 'EUR' || row.feesCurrency !== 'EUR')
    throw new NonEuroOperation({ message: 'Precio y comisión deben estar en EUR.' })
  const buying = row.type === 'buy'
  const cashCurrency = buying ? row.sentCurrency : row.receivedCurrency
  const symbol = buying ? row.receivedCurrency : row.sentCurrency
  if (cashCurrency !== 'EUR' || symbol === 'EUR' || !/^[A-Z0-9]{1,20}$/.test(symbol))
    throw new NonEuroOperation({ message: 'Solo compras y ventas de cripto en EUR.' })
  const quantity = buying ? row.receivedAmount : row.sentAmount
  const gross = new Exact(buying ? row.sentAmount : row.receivedAmount)
  const fee = new Exact(row.feesAmount)
  if (
    !new Exact(quantity).gt(0) ||
    !new Exact(row.priceAmount).gt(0) ||
    !matchesGross(gross, new Exact(quantity).times(row.priceAmount)) ||
    (!buying && fee.gt(gross))
  )
    throw new ProviderError({
      message: 'La operación no cumple el contrato contable validado.',
      retryable: false,
    })
  const instant = Date.parse(row.executedAt)
  if (!Number.isFinite(instant) || instant < range.from || instant > range.to)
    throw new ProviderError({
      message: 'Instante fuera del intervalo solicitado.',
      retryable: false,
    })
  return {
    provider: 'bitvavo',
    externalId: row.transactionId,
    executedAt: row.executedAt,
    timeZone: range.timeZone,
    ...localDateTime(instant, range.timeZone),
    side: row.type,
    symbol,
    quantity,
    unitPrice: row.priceAmount,
    fee: row.feesAmount,
    cashAmount: (buying ? gross.plus(fee) : gross.minus(fee)).toFixed(),
    currency: 'EUR',
  }
}

const TYPE_NAMES: Record<string, string> = {
  deposit: 'Depósito',
  withdrawal: 'Retirada',
  staking: 'Staking',
  rebate: 'Reembolso',
  affiliate: 'Afiliación',
}

/** «Depósito: solo se importan compras y ventas.» for a movement that is not a trade. */
function unsupportedType(item: unknown): string | undefined {
  const typed = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.String }))(item)
  if (typed._tag === 'None' || typed.value.type === 'buy' || typed.value.type === 'sell')
    return undefined
  const name = TYPE_NAMES[typed.value.type] ?? `Tipo «${typed.value.type.slice(0, 40)}»`
  return `${name}: solo se importan compras y ventas.`
}

export function fetchBitvavoHistory(
  credentials: BitvavoCredentials,
  range: HistoryRange,
): Effect.Effect<
  { operations: RemoteOperation[]; incompatible: SkippedOperation[] },
  ClientError,
  Http
> {
  return Effect.gen(function* () {
    const operations: RemoteOperation[] = []
    const incompatible: SkippedOperation[] = []
    const seen = new Set<string>()
    let totalPages: number | undefined
    for (let page = 1; page <= 1000; page++) {
      const result = yield* requestPage(credentials, range, page).pipe(
        Effect.timeout('15 seconds'),
        Effect.mapError((error) =>
          error._tag === 'TimeoutError'
            ? new ProviderError({
                message: 'Bitvavo agotó el tiempo de respuesta.',
                retryable: true,
              })
            : error,
        ),
        Effect.retry({
          schedule: retrySchedule,
          times: 3,
          while: (error: ClientError) =>
            (error instanceof RateLimit && error.retryAfterMs <= 60000) ||
            (error instanceof ProviderError && error.retryable),
        }),
      )
      totalPages ??= result.totalPages
      if (
        result.currentPage !== page ||
        result.totalPages > 1000 ||
        result.totalPages !== totalPages ||
        (!result.items.length && page < result.totalPages)
      )
        return yield* new ProviderError({
          message: 'Historial incompleto: paginación inesperada.',
          retryable: false,
        })
      for (const item of result.items) {
        const identity = Schema.decodeUnknownOption(
          Schema.Struct({ transactionId: Schema.String }),
        )(item)
        if (identity._tag === 'None' || seen.has(identity.value.transactionId))
          return yield* new ProviderError({
            message: 'Historial con identidades ausentes o repetidas.',
            retryable: false,
          })
        seen.add(identity.value.transactionId)
        const timestamp = Schema.decodeUnknownOption(Schema.Struct({ executedAt: Schema.String }))(
          item,
        )
        const executedAt = timestamp._tag === 'Some' ? timestamp.value.executedAt : null
        if (range.startDate) {
          const instant = executedAt ? Date.parse(executedAt) : NaN
          if (
            Number.isFinite(instant) &&
            new Intl.DateTimeFormat('sv-SE', { timeZone: range.timeZone }).format(instant) <
              range.startDate
          )
            continue
        }
        try {
          operations.push(readOperation(item, range))
        } catch (error) {
          incompatible.push({
            externalId: identity.value.transactionId,
            executedAt: executedAt && Number.isFinite(Date.parse(executedAt)) ? executedAt : null,
            reason:
              error instanceof NonEuroOperation || error instanceof ProviderError
                ? error.message
                : (unsupportedType(item) ?? 'Tipo o datos de operación incompatibles.'),
          })
        }
      }
      if (page >= result.totalPages) return { operations, incompatible }
    }
    return yield* new ProviderError({ message: 'Historial demasiado grande.', retryable: false })
  })
}
