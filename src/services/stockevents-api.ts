import { Effect } from 'effect'

import type { StockEventsTransactionPayload } from '../domain/stockevents/transaction-payload'
import { requestApiJson } from '../lib/client/api-client'
import { ApiClientError } from '../lib/client/api-error'
import { reportApiErrorToSentry } from '../lib/client/error-reporting'
import type { ClientHttp } from '../lib/client/http'
import type {
  StockEventsCreatedTransaction,
  StockEventsWatchlist,
  SymbolCheckRequest,
  SymbolCheckResult,
} from '../lib/server/stockevents'

export type {
  StockEventsCreatedTransaction,
  StockEventsWatchlist,
  SymbolCheckRequest,
  SymbolCheckResult,
}

export const fetchStockEventsCredentialStatus = (): Effect.Effect<
  boolean,
  ApiClientError,
  ClientHttp
> =>
  requestApiJson<{ configured?: boolean }>('/api/integrations/stockevents', {
    fallbackMessage: 'No se pudo consultar la credencial de Stock Events',
  }).pipe(Effect.map((body) => body.configured === true))

export const saveStockEventsCredential = (
  apiKey: string,
): Effect.Effect<boolean, ApiClientError, ClientHttp> => {
  const normalized = apiKey.trim()
  return requestApiJson<{ configured?: boolean }>('/api/integrations/stockevents', {
    method: normalized ? 'PUT' : 'DELETE',
    ...(normalized ? { body: { apiKey: normalized } } : {}),
    fallbackMessage: 'No se pudo guardar la credencial de Stock Events',
  }).pipe(Effect.map((body) => body.configured === true))
}

export const fetchStockEventsWatchlists = (): Effect.Effect<
  StockEventsWatchlist[],
  ApiClientError,
  ClientHttp
> =>
  requestApiJson<{ watchlists?: StockEventsWatchlist[] }>('/api/stockevents/watchlists', {
    fallbackMessage: 'No se pudieron cargar las listas de Stock Events',
  }).pipe(Effect.map((body) => body.watchlists || []))

export const checkStockEventsSymbols = (
  checks: SymbolCheckRequest[],
): Effect.Effect<SymbolCheckResult[], ApiClientError, ClientHttp> =>
  requestApiJson<{ results?: SymbolCheckResult[] }>('/api/stockevents/check-symbols', {
    method: 'POST',
    body: { checks },
    fallbackMessage: 'No se pudieron comprobar los símbolos',
  }).pipe(Effect.map((body) => body.results || []))

export const createStockEventsTransaction = (
  transaction: StockEventsTransactionPayload,
): Effect.Effect<StockEventsCreatedTransaction, ApiClientError, ClientHttp> => {
  const endpoint = '/api/stockevents/transactions'
  const fallbackMessage = 'No se pudo crear la transacción en Stock Events'
  return requestApiJson<{ transaction?: StockEventsCreatedTransaction }>(endpoint, {
    method: 'POST',
    body: { transaction },
    fallbackMessage,
  }).pipe(
    Effect.flatMap((body) => {
      if (!body.transaction) {
        // Un 2xx sin transacción es un contrato roto del servidor, no un error de quien usa la app.
        const error = new ApiClientError('invalid-response', { endpoint, fallbackMessage })
        reportApiErrorToSentry(error)
        return Effect.fail(error)
      }
      return Effect.succeed(body.transaction)
    }),
  )
}
