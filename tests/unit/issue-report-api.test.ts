import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({
  isDemoMode: vi.fn(() => false),
}))

import {
  INVALID_RESPONSE_MESSAGE,
  OFFLINE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '../../src/lib/client/api-error'
import { runClientHttp } from '../../src/lib/client/runtime'
import {
  ISSUE_REPORT_ENDPOINT,
  type ReportResponse,
  type ReportPayload,
  submitIssueReport as submitIssueReportEffect,
} from '../../src/services/issue-report-api'

/** El efecto se ejecuta en el borde, igual que el manejador del panel. */
function submitIssueReport(payload: ReportPayload): Promise<ReportResponse> {
  return runClientHttp(submitIssueReportEffect(payload))
}

const FALLBACK_MESSAGE = 'No se pudo crear la issue.'

const payload: ReportPayload = {
  type: 'bug',
  summary: 'El saldo no cuadra',
  description: 'Después de importar el extracto el saldo queda distinto.',
  section: 'dashboard',
  context: {
    userAgent: 'vitest',
    pathname: '/dashboard',
    timestamp: '2026-08-23T00:00:00.000Z',
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorMessageOf(result: ReportResponse): string {
  if (result.ok) throw new Error('Se esperaba un reporte fallido')
  return result.error
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('submitIssueReport con respuesta correcta', () => {
  it('postea el payload como JSON y devuelve la issue creada tal cual', async () => {
    const created = {
      ok: true as const,
      issueNumber: 654,
      issueUrl: 'https://github.com/alberba/finance-tracker/issues/654',
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(created))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitIssueReport(payload)

    expect(result).toEqual(created)
    expect(fetchMock).toHaveBeenCalledWith(ISSUE_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })
})

describe('submitIssueReport con respuesta de error', () => {
  it('conserva el texto que explicó la API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: false, error: 'GitHub no disponible' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitIssueReport(payload)

    expect(result).toEqual({ ok: false, error: 'GitHub no disponible' })
  })

  it('sin respuesta HTTP devuelve el mensaje de conexión y nunca el del motor', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitIssueReport(payload)

    expect(result).toEqual({ ok: false, error: OFFLINE_MESSAGE })
    expect(errorMessageOf(result)).not.toContain('Failed to fetch')
  })

  it('con un cuerpo que no es JSON devuelve el mensaje de respuesta inválida', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>502</html>', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitIssueReport(payload)

    expect(result).toEqual({ ok: false, error: INVALID_RESPONSE_MESSAGE })
    expect(errorMessageOf(result)).not.toContain('Unexpected token')
  })

  it('trata el 401 como sesión vencida', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: false, error: 'Token caducado' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitIssueReport(payload)

    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE })
  })

  it('usa el mensaje del flujo cuando el 400 no explica nada', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: false }, 400))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitIssueReport(payload)

    expect(result).toEqual({ ok: false, error: FALLBACK_MESSAGE })
  })
})
