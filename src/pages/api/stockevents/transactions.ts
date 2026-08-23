import type { APIRoute } from 'astro'
import {
  createStockEventsTransaction,
  type StockEventsTransactionPayload,
} from '../../../lib/server/stockevents'
import { errorResponse, json, readApiKey } from './_helpers'

interface TransactionsBody {
  transaction?: unknown
}

export const POST: APIRoute = async ({ request, locals }) => {
  const apiKey = await readApiKey(request, locals)
  if (!apiKey) {
    return json({ error: 'Falta la API key de Stock Events' }, 400)
  }
  const body = (await request.json().catch(() => ({}))) as TransactionsBody
  const payload = normalizePayload(body.transaction)
  if (!payload) {
    return json({ error: 'Transacción inválida para Stock Events' }, 400)
  }
  try {
    const transaction = await createStockEventsTransaction(apiKey, payload)
    return json({ transaction }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}

function normalizePayload(value: unknown): StockEventsTransactionPayload | null {
  const raw = (value || {}) as Record<string, unknown>
  const watchlistId = String(raw.watchlistId || '').trim()
  const symbol = String(raw.symbol || '')
    .trim()
    .toUpperCase()
  const date = String(raw.date || '').trim()
  const change = Number(raw.change)
  const price = Number(raw.price)
  if (!watchlistId || !symbol || !date || !Number.isFinite(change) || change === 0) {
    return null
  }
  if (!Number.isFinite(price) || price <= 0) {
    return null
  }
  const feesAmount = Number(raw.feesAmount)
  const notes = String(raw.notes || '').trim()
  return {
    watchlistId,
    symbol,
    date,
    change,
    price,
    priceCurrency: String(raw.priceCurrency || 'EUR')
      .trim()
      .toUpperCase()
      .slice(0, 3),
    ...(Number.isFinite(feesAmount) && feesAmount > 0
      ? {
          feesAmount,
          feesCurrency: String(raw.feesCurrency || raw.priceCurrency || 'EUR')
            .trim()
            .toUpperCase()
            .slice(0, 3),
        }
      : {}),
    ...(notes ? { notes } : {}),
    ...(raw.toCash === true ? { toCash: true } : {}),
    type: String(raw.type || (change < 0 ? 'sell' : 'buy')).trim(),
  }
}
