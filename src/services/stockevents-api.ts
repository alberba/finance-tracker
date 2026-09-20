import type { StockEventsTransactionPayload } from '../domain/stockevents/transaction-payload'
import { ApiClientError } from '../lib/client/api-error'
import { requestApiJson } from '../lib/client/api-client'
import { reportApiErrorToSentry } from '../lib/client/error-reporting'
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

export async function fetchStockEventsCredentialStatus(): Promise<boolean> {
  const body = await requestApiJson<{ configured?: boolean }>('/api/integrations/stockevents', {
    fallbackMessage: 'No se pudo consultar la credencial de Stock Events',
  })
  return body.configured === true
}

export async function saveStockEventsCredential(apiKey: string): Promise<boolean> {
  const normalized = apiKey.trim()
  const body = await requestApiJson<{ configured?: boolean }>('/api/integrations/stockevents', {
    method: normalized ? 'PUT' : 'DELETE',
    ...(normalized ? { body: { apiKey: normalized } } : {}),
    fallbackMessage: 'No se pudo guardar la credencial de Stock Events',
  })
  return body.configured === true
}

export async function fetchStockEventsWatchlists(): Promise<StockEventsWatchlist[]> {
  const body = await requestApiJson<{ watchlists?: StockEventsWatchlist[] }>(
    '/api/stockevents/watchlists',
    { fallbackMessage: 'No se pudieron cargar las listas de Stock Events' },
  )
  return body.watchlists || []
}

export async function checkStockEventsSymbols(
  checks: SymbolCheckRequest[],
): Promise<SymbolCheckResult[]> {
  const body = await requestApiJson<{ results?: SymbolCheckResult[] }>(
    '/api/stockevents/check-symbols',
    {
      method: 'POST',
      body: { checks },
      fallbackMessage: 'No se pudieron comprobar los símbolos',
    },
  )
  return body.results || []
}

export async function createStockEventsTransaction(
  transaction: StockEventsTransactionPayload,
): Promise<StockEventsCreatedTransaction> {
  const endpoint = '/api/stockevents/transactions'
  const fallbackMessage = 'No se pudo crear la transacción en Stock Events'
  const body = await requestApiJson<{ transaction?: StockEventsCreatedTransaction }>(endpoint, {
    method: 'POST',
    body: { transaction },
    fallbackMessage,
  })

  if (!body.transaction) {
    // Un 2xx sin transacción es un contrato roto del servidor, no un error de quien usa la app.
    const error = new ApiClientError('invalid-response', { endpoint, fallbackMessage })
    reportApiErrorToSentry(error)
    throw error
  }

  return body.transaction
}
