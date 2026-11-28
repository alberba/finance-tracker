import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

const { chartMock } = vi.hoisted(() => ({ chartMock: vi.fn() }))
vi.mock('../../src/lib/server/yahoo-finance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/server/yahoo-finance')>()),
  yahooFinance: { chart: chartMock },
}))

import type { Benchmark } from '../../src/domain/investment/benchmarks'
import { loadBenchmarkCloses, monthlyCloses } from '../../src/lib/server/benchmark-history'
import { MarketQuoteError } from '../../src/lib/server/market-data'

const bar = (iso: string, close: number | null, adjclose?: number | null) => ({
  date: new Date(iso),
  close,
  ...(adjclose === undefined ? {} : { adjclose }),
})

describe('monthlyCloses', () => {
  it('ordena un cierre por mes empezando por diciembre del año anterior', () => {
    const closes = monthlyCloses(
      [
        bar('2025-12-01T00:00:00Z', 100),
        bar('2026-01-01T00:00:00Z', 101),
        bar('2026-02-01T00:00:00Z', 102),
      ],
      2026,
    )
    expect(closes).toEqual([100, 101, 102])
  })

  it('prefiere el cierre ajustado al cierre', () => {
    expect(monthlyCloses([bar('2025-12-01T00:00:00Z', 100, 95)], 2026)).toEqual([95])
    expect(monthlyCloses([bar('2025-12-01T00:00:00Z', 100, null)], 2026)).toEqual([100])
  })

  it('coloca en su mes una barra fechada el último día del mes anterior en UTC', () => {
    const closes = monthlyCloses(
      [bar('2025-11-30T23:00:00Z', 90), bar('2025-12-31T23:00:00Z', 100)],
      2026,
    )
    // 30-nov 23:00Z es diciembre (índice 0); 31-dic 23:00Z es enero (índice 1)
    expect(closes).toEqual([90, 100])
  })

  it('ignora cierres nulos o no finitos y barras fuera del año', () => {
    const closes = monthlyCloses(
      [
        bar('2025-11-01T00:00:00Z', 80),
        bar('2025-12-01T00:00:00Z', 100),
        bar('2026-01-01T00:00:00Z', null),
        bar('2026-02-01T00:00:00Z', Number.NaN),
        bar('2027-02-01T00:00:00Z', 200),
      ],
      2026,
    )
    expect(closes).toEqual([100])
  })

  it('un mes sin cierre corta la serie', () => {
    const closes = monthlyCloses(
      [
        bar('2025-12-01T00:00:00Z', 100),
        bar('2026-01-01T00:00:00Z', 101),
        bar('2026-03-01T00:00:00Z', 103),
      ],
      2026,
    )
    expect(closes).toEqual([100, 101])
  })

  it('sin barras devuelve vacío, y se queda con la última barra de un mismo mes', () => {
    expect(monthlyCloses([], 2026)).toEqual([])
    expect(
      monthlyCloses([bar('2025-12-01T00:00:00Z', 100), bar('2025-12-15T00:00:00Z', 105)], 2026),
    ).toEqual([105])
  })
})

describe('loadBenchmarkCloses', () => {
  const benchmark: Benchmark = { id: 'test', name: 'Índice de prueba', symbol: 'TEST.DE' }
  let counter = 0
  // La caché es de módulo: un año distinto por test evita acoplarlos.
  const nextYear = () => 2000 + ++counter

  beforeEach(() => {
    chartMock.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('consulta Yahoo con el rango del año y devuelve los cierres mensuales', async () => {
    const year = nextYear()
    chartMock.mockResolvedValue({
      quotes: [bar(`${year - 1}-12-01T00:00:00Z`, 10), bar(`${year}-01-01T00:00:00Z`, 11)],
    })

    const closes = await Effect.runPromise(loadBenchmarkCloses(benchmark, year))

    expect(closes).toEqual([10, 11])
    expect(chartMock).toHaveBeenCalledWith('TEST.DE', {
      period1: `${year - 1}-12-01`,
      period2: `${year + 1}-01-01`,
      interval: '1mo',
    })
  })

  it('reutiliza la caché hasta que pasan seis horas', async () => {
    const year = nextYear()
    chartMock.mockResolvedValue({ quotes: [bar(`${year - 1}-12-01T00:00:00Z`, 10)] })

    await Effect.runPromise(loadBenchmarkCloses(benchmark, year))
    vi.advanceTimersByTime(5 * 60 * 60 * 1000)
    await Effect.runPromise(loadBenchmarkCloses(benchmark, year))
    expect(chartMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    await Effect.runPromise(loadBenchmarkCloses(benchmark, year))
    expect(chartMock).toHaveBeenCalledTimes(2)
  })

  it('la caché distingue símbolo y año', async () => {
    const year = nextYear()
    chartMock.mockResolvedValue({ quotes: [] })

    await Effect.runPromise(loadBenchmarkCloses(benchmark, year))
    await Effect.runPromise(loadBenchmarkCloses({ ...benchmark, symbol: 'OTRO.DE' }, year))
    await Effect.runPromise(loadBenchmarkCloses(benchmark, year + 1000))

    expect(chartMock).toHaveBeenCalledTimes(3)
  })

  it('falla con MarketQuoteError y no cachea si Yahoo falla', async () => {
    const year = nextYear()
    chartMock.mockRejectedValueOnce(new Error('boom'))

    const error = await Effect.runPromise(Effect.flip(loadBenchmarkCloses(benchmark, year)))
    expect(error).toBeInstanceOf(MarketQuoteError)
    expect(error.message).toBe('No se pudo consultar Índice de prueba.')

    chartMock.mockResolvedValueOnce({ quotes: [bar(`${year - 1}-12-01T00:00:00Z`, 7)] })
    await expect(Effect.runPromise(loadBenchmarkCloses(benchmark, year))).resolves.toEqual([7])
  })
})
