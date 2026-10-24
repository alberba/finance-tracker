import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({
  isDemoMode: vi.fn(() => true),
}))

import { submitIssueReport } from '../../src/services/issue-report-api'
import { fetchMarketQuotes, searchMarketSymbols } from '../../src/services/market-api'
import { runClientHttp } from '../../src/lib/client/runtime'

describe('demo remote guards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('uses local fallback quotes without requesting providers', async () => {
    const fallbackQuotes = { fund: { price: 12, updatedAt: '2026-08-23' } }

    await expect(
      runClientHttp(fetchMarketQuotes([{ id: 'fund' } as never], fallbackQuotes as never)),
    ).resolves.toBe(fallbackQuotes)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not search symbols remotely', async () => {
    await expect(runClientHttp(searchMarketSymbols('ACME', 'manual'))).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects issue reports locally', async () => {
    const result = await runClientHttp(
      submitIssueReport({
        type: 'bug',
        summary: 'Reporte de prueba',
        description: 'No debe salir del navegador.',
        section: 'dashboard',
        context: {
          userAgent: 'vitest',
          pathname: '/demo',
          timestamp: '2026-08-23T00:00:00.000Z',
        },
      }),
    )

    expect(result).toEqual({
      ok: false,
      error: 'Los reportes no se envían desde el modo demo.',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
