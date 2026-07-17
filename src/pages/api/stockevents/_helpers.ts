import { StockEventsApiError } from '../../../lib/server/stockevents'

export function readApiKey(request: Request): string {
  return String(request.headers.get('x-stockevents-key') || '').trim()
}

export function errorResponse(error: unknown): Response {
  if (error instanceof StockEventsApiError) {
    return json({ error: error.message }, error.status >= 400 ? error.status : 502)
  }
  const message = error instanceof Error ? error.message : 'Error al contactar con Stock Events'
  return json({ error: message }, 502)
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
