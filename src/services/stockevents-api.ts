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

function buildHeaders(withJsonBody: boolean): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(withJsonBody ? { 'Content-Type': 'application/json' } : {}),
  }
}

export async function fetchStockEventsCredentialStatus(): Promise<boolean> {
  const response = await fetch('/api/integrations/stockevents', { headers: buildHeaders(false) })
  const body = (await response.json()) as { configured?: boolean; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudo consultar la credencial de Stock Events')
  return body.configured === true
}

export async function saveStockEventsCredential(apiKey: string): Promise<boolean> {
  const normalized = apiKey.trim()
  const response = await fetch('/api/integrations/stockevents', {
    method: normalized ? 'PUT' : 'DELETE',
    headers: buildHeaders(normalized.length > 0),
    ...(normalized ? { body: JSON.stringify({ apiKey: normalized }) } : {}),
  })
  const body = (await response.json()) as { configured?: boolean; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudo guardar la credencial de Stock Events')
  return body.configured === true
}

export async function fetchStockEventsWatchlists(): Promise<StockEventsWatchlist[]> {
  const response = await fetch('/api/stockevents/watchlists', {
    headers: buildHeaders(false),
  })
  const body = (await response.json()) as { watchlists?: StockEventsWatchlist[]; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las listas de Stock Events')
  return body.watchlists || []
}

export async function checkStockEventsSymbols(
  checks: SymbolCheckRequest[],
): Promise<SymbolCheckResult[]> {
  const response = await fetch('/api/stockevents/check-symbols', {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify({ checks }),
  })
  const body = (await response.json()) as { results?: SymbolCheckResult[]; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudieron comprobar los símbolos')
  return body.results || []
}

export async function createStockEventsTransaction(
  transaction: StockEventsTransactionPayload,
): Promise<StockEventsCreatedTransaction> {
  const response = await fetch('/api/stockevents/transactions', {
    method: 'POST',
    headers: buildHeaders(true),
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
