import { beforeEach, describe, expect, it, vi } from 'vitest'

const { chartMock } = vi.hoisted(() => ({ chartMock: vi.fn() }))
vi.mock('../../src/lib/server/yahoo-finance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/server/yahoo-finance')>()),
  yahooFinance: { chart: chartMock },
}))

import { Effect } from 'effect'

import type { PriceRange } from '../../src/domain/investment/price-history'
import { Http } from '../../src/lib/server/http'
import { clearPriceHistoryCache, loadPriceHistory } from '../../src/lib/server/price-history'
import type { Instrument } from '../../src/scripts/types'

const NOW = new Date('2026-11-27T17:00:00Z')

const load = (
  instrument: Pick<Instrument, 'symbol' | 'quoteSymbol' | 'type' | 'currency'>,
  range: PriceRange,
  request: typeof fetch = vi.fn<typeof fetch>(),
) =>
  Effect.runPromise(
    Effect.provideService(loadPriceHistory(instrument, range, NOW), Http, { request }),
  )

const bar = (iso: string, close: number) => ({ date: new Date(iso), close })

describe('histórico de la cotización de un símbolo', () => {
  beforeEach(() => {
    chartMock.mockReset()
    clearPriceHistoryCache()
  })

  it('la gráfica de 1 día dibuja solo la última sesión y la mide contra el cierre anterior', async () => {
    chartMock.mockResolvedValue({
      meta: { currency: 'EUR', gmtoffset: 3600 },
      quotes: [
        bar('2026-11-26T16:25:00Z', 10.7),
        bar('2026-11-26T16:30:00Z', 10.8),
        // 00:10 in Madrid on the 27th: the new session, though still the 26th in UTC.
        bar('2026-11-26T23:10:00Z', 10.85),
        bar('2026-11-27T08:00:00Z', 10.86),
        bar('2026-11-27T16:30:00Z', 10.9),
      ],
    })

    const history = await load({ symbol: 'SAN.MC', type: 'stock', currency: 'EUR' }, '1d')

    expect(history).toMatchObject({ intraday: true, previousClose: 10.8, currency: 'EUR' })
    expect(history.points.map((point) => point.close)).toEqual([10.85, 10.86, 10.9])
    expect(chartMock).toHaveBeenCalledWith('SAN.MC', expect.objectContaining({ interval: '5m' }))
  })

  it('un fondo sin histórico en Yahoo dibuja sus valores liquidativos de Morningstar', async () => {
    chartMock.mockRejectedValue(new Error('Not Found'))
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          TimeSeries: {
            Security: [
              {
                HistoryDetail: [
                  { EndDate: '2026-11-26', Value: '62.3372' },
                  { EndDate: '2026-11-27', Value: '63.4458' },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )

    const history = await load(
      { symbol: 'Vanguard Global', quoteSymbol: '0P00000WLG.F', type: 'fund', currency: 'EUR' },
      '1mo',
      fetchMock,
    )

    expect(history).toMatchObject({
      source: 'morningstar',
      currency: 'EUR',
      previousClose: 62.3372,
    })
    expect(history.points.map((point) => point.close)).toEqual([62.3372, 63.4458])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/id=0P00000WLG&.*startDate=2026-10-27/),
      expect.anything(),
    )
  })
})
