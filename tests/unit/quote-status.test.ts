import { describe, expect, it } from 'vitest'

import {
  QUOTE_STATUS,
  summarizeQuoteStatus,
} from '../../src/domain/investment/quote-status'
import type { InstrumentValuation } from '../../src/domain/investment/valuation'
import type { Quote } from '../../src/scripts/types'

function quote(timestamp: string): Quote {
  return {
    instrumentId: 'vwce',
    price: 1,
    currency: 'EUR',
    timestamp,
    fetchedAt: timestamp,
    dataType: 'unknown',
    source: 'test',
    status: 'fresh',
    isStale: false,
    previousClose: null,
    changePercent: null,
  }
}

function valuation(
  status: InstrumentValuation['status'],
  timestamp: string | null,
): Pick<InstrumentValuation, 'status' | 'quote'> {
  return {
    status,
    quote: timestamp ? quote(timestamp) : null,
  }
}

describe('QUOTE_STATUS', () => {
  it('traduce cada estado a una etiqueta y un tono', () => {
    expect(QUOTE_STATUS.fresh).toEqual({ label: 'Actualizado', tone: 'gain' })
    expect(QUOTE_STATUS.stale).toEqual({ label: 'Retrasado', tone: 'warn' })
    expect(QUOTE_STATUS.unavailable).toEqual({ label: 'Sin cotización', tone: 'loss' })
  })
})

describe('summarizeQuoteStatus', () => {
  it('no resume nada si ningún instrumento tiene cotización', () => {
    expect(summarizeQuoteStatus([])).toBeNull()
    expect(summarizeQuoteStatus([valuation('unavailable', null)])).toBeNull()
  })

  it('está actualizado solo si todas las cotizaciones lo están', () => {
    const summary = summarizeQuoteStatus([
      valuation('fresh', '2026-09-26T08:00:00Z'),
      valuation('fresh', '2026-09-26T08:42:00Z'),
    ])

    expect(summary).toEqual({
      status: 'fresh',
      label: 'Cotizaciones actualizadas',
      tone: 'gain',
      latest: '2026-09-26T08:42:00.000Z',
    })
  })

  it('está retrasado si alguna cotización lo está', () => {
    expect(
      summarizeQuoteStatus([
        valuation('fresh', '2026-09-26T08:42:00Z'),
        valuation('stale', '2026-09-25T08:00:00Z'),
      ]),
    ).toMatchObject({ status: 'stale', label: 'Cotizaciones retrasadas', tone: 'warn' })
  })

  it('un instrumento sin cotización no cuenta como retraso', () => {
    expect(
      summarizeQuoteStatus([
        valuation('fresh', '2026-09-26T08:42:00Z'),
        valuation('unavailable', null),
      ]),
    ).toMatchObject({ status: 'fresh', latest: '2026-09-26T08:42:00.000Z' })
  })

  it('ignora marcas de tiempo inválidas', () => {
    expect(
      summarizeQuoteStatus([
        valuation('stale', 'not-a-date'),
        valuation('fresh', '2026-09-26T08:42:00Z'),
      ]),
    ).toMatchObject({ latest: '2026-09-26T08:42:00.000Z' })
  })
})
