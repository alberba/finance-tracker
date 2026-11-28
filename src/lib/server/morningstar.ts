/**
 * Daily prices of a fund from Morningstar, by ISIN or by Morningstar id (`0P…`).
 *
 * It is the endpoint Morningstar's own fund pages call: public, keyless and
 * undocumented, so it can change without notice. It backs Yahoo up for funds,
 * which have one price a day, and is never asked for intraday data. See
 * `docs/research/cotizaciones-gratuitas-2026-11-28.md`.
 */

import { Data, Effect } from 'effect'

import type { PricePoint } from '../../domain/investment/price-history'
import type { Instrument } from '../../scripts/types'
import { Http } from './http'

const BASE_URL = 'https://lt.morningstar.com/api/rest.svc/timeseries_price/klr5zyak8x'
const TIMEOUT = '5 seconds'
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/
// A Yahoo fund ticker is the Morningstar id plus an exchange suffix: 0P0000KSPA.F.
const MORNINGSTAR_ID = /^(0P[0-9A-Z]{8})(\..+)?$/

export class MorningstarError extends Data.TaggedError('MorningstarError')<{
  message: string
}> {}

export interface MorningstarId {
  id: string
  idType: 'ISIN' | 'Morningstar'
}

/** The fund's id on Morningstar when its ticker or symbol is an ISIN or a `0P…` id. */
export function morningstarId(
  instrument: Pick<Instrument, 'symbol' | 'quoteSymbol' | 'type'>,
): MorningstarId | null {
  if (instrument.type === 'crypto') return null
  for (const value of [instrument.quoteSymbol, instrument.symbol]) {
    const symbol = (value ?? '').trim().toUpperCase()
    if (ISIN.test(symbol)) return { id: symbol, idType: 'ISIN' }
    const match = MORNINGSTAR_ID.exec(symbol)
    if (match) return { id: match[1], idType: 'Morningstar' }
  }
  return null
}

/** Closes in euros from `startDate` (YYYY-MM-DD), oldest first. */
export function fetchMorningstarCloses(
  fund: MorningstarId,
  startDate: string,
  frequency: 'daily' | 'weekly',
): Effect.Effect<PricePoint[], MorningstarError, Http> {
  const params = new URLSearchParams({
    id: fund.id,
    currencyId: 'EUR',
    frequency,
    startDate,
    outputType: 'JSON',
  })
  if (fund.idType === 'ISIN') params.set('idtype', 'ISIN')
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* Effect.tryPromise({
      try: (signal) => http.request(`${BASE_URL}?${params.toString()}`, { signal }),
      catch: () => new MorningstarError({ message: 'No se pudo contactar con Morningstar.' }),
    }).pipe(
      Effect.timeout(TIMEOUT),
      Effect.catchTag('TimeoutError', () =>
        Effect.fail(new MorningstarError({ message: 'Morningstar agotó el tiempo de respuesta.' })),
      ),
    )
    if (!response.ok) {
      return yield* new MorningstarError({ message: `Morningstar respondió ${response.status}` })
    }
    const body = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => new MorningstarError({ message: 'Respuesta inválida de Morningstar.' }),
    })
    const points = parseCloses(body)
    if (!points.length) {
      return yield* new MorningstarError({ message: 'Morningstar no tiene precios de ese fondo.' })
    }
    return points
  })
}

interface TimeSeriesBody {
  TimeSeries?: { Security?: { HistoryDetail?: { EndDate?: string; Value?: string }[] }[] }
}

function parseCloses(body: unknown): PricePoint[] {
  const rows = (body as TimeSeriesBody)?.TimeSeries?.Security?.[0]?.HistoryDetail ?? []
  const points: PricePoint[] = []
  for (const row of rows) {
    const t = Date.parse(`${row.EndDate ?? ''}T00:00:00Z`)
    const close = Number(row.Value)
    if (Number.isFinite(t) && Number.isFinite(close) && close > 0) points.push({ t, close })
  }
  return points.sort((a, b) => a.t - b.t)
}
