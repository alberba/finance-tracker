import type { StockEventsTransactionPayload } from '../domain/stockevents/transaction-payload'
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

function buildHeaders(apiKey: string, withJsonBody: boolean): Record<string, string> {
  return {
    Accept: 'application/json',
    'x-stockevents-key': apiKey,
    ...(withJsonBody ? { 'Content-Type': 'application/json' } : {}),
  }
}

export async function fetchStockEventsWatchlists(apiKey: string): Promise<StockEventsWatchlist[]> {
  const response = await fetch('/api/stockevents/watchlists', {
    headers: buildHeaders(apiKey, false),
  })
  const body = (await response.json()) as { watchlists?: StockEventsWatchlist[]; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las listas de Stock Events')
  return body.watchlists || []
}

export async function checkStockEventsSymbols(
  apiKey: string,
  checks: SymbolCheckRequest[],
): Promise<SymbolCheckResult[]> {
  const response = await fetch('/api/stockevents/check-symbols', {
    method: 'POST',
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify({ checks }),
  })
  const body = (await response.json()) as { results?: SymbolCheckResult[]; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudieron comprobar los símbolos')
  return body.results || []
}

export async function createStockEventsTransaction(
  apiKey: string,
  transaction: StockEventsTransactionPayload,
): Promise<StockEventsCreatedTransaction> {
  const response = await fetch('/api/stockevents/transactions', {
    method: 'POST',
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify({ transaction }),
  })
  const body = (await response.json()) as {
    transaction?: StockEventsCreatedTransaction
    error?: string
  }
  if (!response.ok || !body.transaction) {
    throw new Error(body.error || 'No se pudo crear la transacción en Stock Events')
  }
  return body.transaction
}
